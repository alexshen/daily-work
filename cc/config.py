import configparser

class Config:
    def __init__(self, path):
        self._parser = configparser.ConfigParser()
        self._parser.read(path)
        self._path = path

    def get(self, section, key, default=None):
        return self._parser.get(section, key, fallback=default)

    def getint(self, section, key, default=0):
        return int(self.get(section, key, default))

    def getbool(self, section, key, default=False):
        return bool(self.get(section, key, default))

    def set(self, section, key, value):
        if not self._parser.has_section(section):
            self._parser.add_section(section)
        self._parser.set(section, key, value)

    def save(self):
        with open(self._path, 'w') as fp:
            self._parser.write(fp)

