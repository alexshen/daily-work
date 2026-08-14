"""Rich TUI layer for sqy_add_visit_record.

A full-screen, three-stage live display:

- login:      Spinner + status text, log below (no Progress)
- processing: Progress bar fixed at top, log below
- completed:  "✓ Processing completed" + summary, log below (retained)

The log region is a fixed-height viewport that shows only the *tail* of the
full log history. Its height is recomputed from the terminal size on every
frame, so resizing the terminal grows or shrinks the window without ever
discarding history, and the terminal never scrolls because of log output.

Full history is kept in memory (LogBuffer, never truncated by the viewport)
and mirrored to a log file (default ~/.sqy_add_visit_record.log) by
AppUI.setup_logging.
"""

import logging
import os
import sys
import threading

from rich import box
from rich.console import Console, Group
from rich.live import Live
from rich.panel import Panel
from rich.progress import BarColumn, Progress, TextColumn
from rich.rule import Rule
from rich.spinner import Spinner
from rich.text import Text

LOG_LEVEL_STYLE = {
    logging.DEBUG: ("[DEBUG]", "dim"),
    logging.INFO: ("[INFO]", "dim"),
    logging.WARNING: ("[WARN]", "yellow"),
    logging.ERROR: ("[ERROR]", "red"),
    logging.CRITICAL: ("[ERROR]", "bold red"),
}

DEFAULT_LOG_PATH = os.path.join(os.path.expanduser("~"), ".sqy_add_visit_record.log")


class LogBuffer:
    """Thread-safe full log history plus a cached wrapped-line view.

    ``_messages`` keeps the complete styled history (never discarded, even when
    the terminal shrinks). ``_lines`` is a flat list of wrapped terminal lines
    at the current content width, rebuilt only when the width changes (a
    terminal resize), otherwise extended incrementally per message.
    """

    def __init__(self):
        self._lock = threading.RLock()
        self._messages = []  # list[Text], full history, unwrapped
        self._lines = []  # list[Text], flat wrapped view at _wrapped_width
        self._wrapped_width = None
        self._wrap_console = Console(highlight=False)

    def add(self, text):
        """Append one styled log message to the full history."""
        with self._lock:
            self._messages.append(text)
            if self._wrapped_width is not None:
                self._lines.extend(text.wrap(self._wrap_console, self._wrapped_width))

    def tail(self, width, height):
        """Return exactly ``height`` wrapped lines, newest at the bottom.

        Wrapping is delegated to Rich's ``Text.wrap``, so long messages and CJK
        double-width characters occupy exactly the terminal cells they will
        render in. Fewer lines than ``height`` are blank-padded at the top so
        the newest log always sits at the bottom (auto-scroll to the tail).
        """
        if height <= 0:
            return []
        with self._lock:
            if width != self._wrapped_width:
                self._wrapped_width = width
                self._lines = []
                for msg in self._messages:
                    self._lines.extend(msg.wrap(self._wrap_console, width))
            lines = self._lines
            if len(lines) >= height:
                return lines[-height:]
            return [Text("")] * (height - len(lines)) + lines


class UIHandler(logging.Handler):
    """A logging handler that feeds the TUI's LogBuffer.

    While the Live display is inactive (not started, or the output is not a
    terminal) records are also written straight to the real stdout/stderr, so
    early fatal errors and piped runs keep working exactly as before. It never
    calls ``live.refresh()`` itself — the auto-refresh thread picks up new
    lines — which keeps the lock ordering simple and deadlock-free.
    """

    def __init__(self, buffer, app):
        super().__init__(level=logging.INFO)
        self._buffer = buffer
        self._app = app
        # Capture the real streams now, before Live may swap sys.stderr for a
        # FileProxy.
        self._fallback_out = sys.stdout
        self._fallback_err = sys.stderr

    def emit(self, record):
        try:
            tag, style = LOG_LEVEL_STYLE.get(record.levelno, ("[INFO]", "dim"))
            text = Text()
            text.append(tag + " ", style=style)
            text.append(record.getMessage())  # literal; "\n" is split by wrap()
            self._buffer.add(text)
            if not self._app.active:
                target = (
                    self._fallback_err
                    if record.levelno >= logging.WARNING
                    else self._fallback_out
                )
                target.write(f"{tag} {record.getMessage()}\n")
                target.flush()
        except Exception:
            self.handleError(record)


def _wait_enter():
    """Block until the user presses Enter, without echoing the newline."""
    if not sys.stdin.isatty():
        sys.stdin.readline()
        return
    if os.name == "nt":
        import msvcrt

        while True:
            ch = msvcrt.getwch()
            if ch in ("\r", "\n"):
                return
    else:
        import termios

        fd = sys.stdin.fileno()
        old = termios.tcgetattr(fd)
        new = termios.tcgetattr(fd)
        new[3] &= ~termios.ECHO  # keep ICANON so Enter still delivers the line
        try:
            termios.tcsetattr(fd, termios.TCSADRAIN, new)
            sys.stdin.readline()
        finally:
            termios.tcsetattr(fd, termios.TCSADRAIN, old)


class AppUI:
    """Owns the Console, the Live display, the Progress, and the stage state."""

    def __init__(self, refresh_per_second=8.0, force_plain=False):
        # State first: Live.__init__ calls get_renderable() once.
        self._stage = "login"  # "login" | "processing" | "completed"
        self._status_text = ""
        self._summary_text = ""
        self._pause_prompt = None
        self._task_id = None
        self._file_handler = None
        self._logger = None
        # force_plain is public so the CLI can set it after parse_args() (see
        # _use_live). _progress_total backs the plain-mode "进度: i/N" lines.
        self.force_plain = bool(force_plain)
        self._progress_total = 0
        # One Spinner instance reused across frames: Rich's Spinner advances by
        # elapsed time since its first render, so creating a fresh instance per
        # frame would pin it to glyph 0 and freeze the animation.
        self._spinner = Spinner("dots", text="", style="cyan")

        self.console = Console(highlight=False)
        self._scratch = Console(highlight=False)
        self._buffer = LogBuffer()
        self._progress = Progress(
            TextColumn("{task.description}"),
            BarColumn(bar_width=None),
            TextColumn("{task.completed:.0f}/{task.total:.0f} {task.percentage:.0f}%"),
            console=self.console,
            expand=True,  # let BarColumn(bar_width=None) fill the panel width
            redirect_stdout=False,
            redirect_stderr=False,
        )
        # Never call self._progress.start() — we embed get_renderable() in our
        # own Live instead, so the progress display has no separate Live.
        self._live = Live(
            console=self.console,
            screen=False,
            auto_refresh=True,
            refresh_per_second=refresh_per_second,
            transient=False,  # keep the final frame after stop()
            redirect_stdout=False,
            # Route stray Chromium/Playwright stderr through the render hook so
            # it appears inside the live region and self-clears next tick
            # instead of permanently desyncing the frame.
            redirect_stderr=True,
            vertical_overflow="crop",
            get_renderable=self._render_frame,
        )

    @property
    def _use_live(self):
        """True when the full-screen Live should run.

        False on classic Windows consoles (no VT processing, e.g. Windows 7
        cmd), where Rich cannot redraw the Live in place and every refresh
        scrolls the screen — there we fall back to plain append-only log
        output. Also forced off by ``force_plain``.
        """
        return bool(
            self.console.is_terminal
            and not self.console.legacy_windows
            and not self.force_plain
        )

    @property
    def active(self):
        return bool(self._use_live and self._live.is_started)

    # -- stage transitions -------------------------------------------------

    def set_status(self, text):
        self._status_text = text
        if self._use_live:
            self._live.refresh()
        # Plain mode: no output here — callers pair set_status with a
        # logger.info of the same message, so emitting would double-print.

    def begin_processing(self, total):
        self._stage = "processing"
        self._task_id = self._progress.add_task("Processing", total=total, completed=0)
        self._progress_total = total
        if self._use_live:
            self._live.refresh()
        elif self._logger is not None:
            self._logger.info(f"开始处理 {total} 条记录")

    def advance(self, completed):
        if self._task_id is None:
            return
        # refresh=False: Progress's own Live is never started, so this only
        # mutates task state. The buffer lock is not held here, so calling
        # live.refresh() afterwards is safe (no lock-ordering cycle).
        self._progress.update(self._task_id, completed=completed, refresh=False)
        if self._use_live:
            self._live.refresh()
        elif self._logger is not None:
            # Per-record: successful submits aren't logged by the caller, so
            # this is the only progress feedback in plain mode.
            self._logger.info(f"进度: {completed}/{self._progress_total}")

    def show_completed(self, summary):
        self._stage = "completed"
        self._summary_text = summary
        if self._use_live:
            self._live.refresh()
        # Plain mode: no output here — main() logs the summary just before
        # calling this.

    def pause(self, prompt):
        """Show a prompt and block until the user presses Enter.

        In the TUI the prompt is rendered in-frame; the Live is never
        stopped/restarted here, so the frame never scrolls and the
        auto-refresh thread is not respawned. In plain mode the prompt is
        printed as a normal line (branching on ``_use_live`` rather than
        ``console.is_terminal`` matters: on a legacy Windows terminal
        ``is_terminal`` is True even though no Live is running, so the old
        branch would wait without ever showing the prompt).
        """
        self._pause_prompt = prompt
        if self._use_live:
            self._live.refresh()
            _wait_enter()
        else:
            self.console.print(prompt)
            _wait_enter()
        self._pause_prompt = None

    # -- logging -----------------------------------------------------------

    def setup_logging(self, logger, log_path=None):
        logger.setLevel(logging.INFO)
        logger.propagate = False
        for h in list(logger.handlers):
            logger.removeHandler(h)
        logger.addHandler(UIHandler(self._buffer, self))
        if log_path is None:
            log_path = DEFAULT_LOG_PATH
        try:
            fh = logging.FileHandler(log_path, mode="a", encoding="utf-8")
        except OSError as exc:
            # Non-fatal: the TUI still keeps full history in memory.
            sys.stderr.write(f"警告: 无法写入日志文件 {log_path}: {exc}\n")
            return
        fh.setLevel(logging.INFO)
        fh.setFormatter(
            logging.Formatter(
                "%(asctime)s [%(levelname)s] %(message)s",
                datefmt="%Y-%m-%d %H:%M:%S",
            )
        )
        logger.addHandler(fh)
        self._file_handler = fh
        self._logger = logger

    # -- lifecycle ---------------------------------------------------------

    def __enter__(self):
        if self._use_live:
            self._live.start(refresh=True)
        return self

    def __exit__(self, *exc):
        self._live.stop()

    def close(self):
        self._live.stop()  # idempotent
        if self._file_handler is not None and self._logger is not None:
            self._logger.removeHandler(self._file_handler)
            self._file_handler.close()
            self._file_handler = None
            self._logger = None

    # -- rendering ---------------------------------------------------------

    def _top_block(self, width):
        """Return (renderable, row_count) for the fixed top region.

        Row count must match the rendered height exactly: the log region's
        height is derived from it, so a long summary that wraps must be counted
        as multiple rows.
        """
        if self._stage == "login":
            self._spinner.update(text=self._status_text)
            rows = [self._spinner]
            n = 1
            if self._pause_prompt:
                rows.append(Text(self._pause_prompt, style="bold yellow"))
                n += 1
            return Group(*rows), n
        if self._stage == "processing":
            rows = [self._progress.get_renderable()]
            n = 1
            if self._pause_prompt:
                rows.append(Text(self._pause_prompt, style="bold yellow"))
                n += 1
            return Group(*rows), n
        # completed
        rows = [Text("✓ Processing completed", style="bold green")]
        n = 1
        summary = Text(self._summary_text, style="bold")
        for line in summary.wrap(self._scratch, width):
            rows.append(line)
            n += 1
        if self._pause_prompt:
            rows.append(Text(self._pause_prompt, style="bold yellow"))
            n += 1
        return Group(*rows), n

    def _render_frame(self):
        # Runs on the auto-refresh background thread. console.size reads the
        # terminal size fresh each time, so a resize is picked up here.
        width, height = self.console.size
        content_width = max(1, width - 4)  # -2 borders, -2 padding (0,1)
        top, top_height = self._top_block(content_width)
        log_height = max(1, height - 3 - top_height)  # -2 borders, -1 Rule
        log_lines = self._buffer.tail(content_width, log_height)
        content = Group(top, Rule(style="dim"), *log_lines)
        return Panel(
            content,
            height=height,
            padding=(0, 1),
            box=box.ROUNDED,
            border_style="dim",
        )
