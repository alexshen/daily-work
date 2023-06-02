#! /usr/bin/env python3

from PIL import Image, ImageColor
import argparse
import sys
import os


def is_blank_line(im, y, bg_color):
    pa = im.load()
    rgb = bg_color[:3]
    for x in range(im.size[0]):
        c = pa[x, y]
        # skip transparent pixels
        if len(c) == 4 and c[3] == 0:
            continue
        if pa[x, y][:3] != rgb:
            return False
    return True

# try to split the image at a location within [top, bottom]
# return the splitting location
# NOTE: if splitting is not possible, bottom is returned


def try_split(im, top, bottom, bg_color):
    if top > bottom:
        raise ValueError('top > bottom')

    y = bottom - 1
    while y > top:
        if is_blank_line(im, y, bg_color):
            return y + 1
        y -= 1
    return bottom


_OUTPUT_MODES = {
    '.jpg': 'RGB',
    '.jpeg': 'RGB',
    '.png': 'RGBA'
}
_VALID_FORMATS = sorted(_OUTPUT_MODES.keys())


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('height', type=int, help='maximum height of a split')
    parser.add_argument('-o', default=0, type=int, dest='overlap',
                        help='number of pixels overlapped between adjcent splits')
    parser.add_argument('input', help='input image')
    parser.add_argument('output', help='printf style output file name pattern')
    args = parser.parse_args()
    ext = os.path.splitext(args.output)[1].lower()

    im = Image.open(args.input)
    # assume that the color of the top left corner is the background color
    bg_color = im.getpixel((0, 0))
    print('bg color: {0}'.format(bg_color))
    width, height = im.size
    print('size: {0}'.format(im.size))
    y = 0
    i = 0
    while y < height:
        # check if we can split at y
        if y + args.height < height:
            spl = try_split(im, y, y + args.height, bg_color)
        else:
            spl = height
        split = im.crop((0, max(y - args.overlap, 0), width,
                        min(spl + args.overlap, height)))
        fname = args.output % i
        split.save(fname)
        print(fname)
        y = spl
        i += 1


if __name__ == '__main__':
    main()
