#! /usr/bin/env python3

from PIL import Image, ImageColor
import argparse
import sys
import os

def is_blank_line(im, y, bg_color):
    pa = im.load()
    for x in range(im.size[0]):
        c = pa[x, y]
        if len(c) == 4 and c[3] == 0:
            continue
        if pa[x, y][:3] != bg_color:
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


_VALID_FORMATS = ('.jpg', '.png')
_OUTPUT_MODES = {
    '.jpg': 'RGB',
    '.png': 'RGBA'
}

def validate_format(s):
    if os.path.splitext(s)[1].lower() not in _VALID_FORMATS:
        raise argparse.ArgumentTypeError('only {} are supported'.format(_VALID_FORMATS))
    return s

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('height', type=int, help='maximum height of a split')
    parser.add_argument('input', help='input image')
    parser.add_argument('output', type=validate_format, help='printf style output file name pattern')
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
        split = im.crop((0, y, width, spl))
        if split.mode != _OUTPUT_MODES[ext]:
            split = split.convert(_OUTPUT_MODES[ext])
        fname = args.output % i
        split.save(fname)
        print(fname)
        y = spl
        i += 1

if __name__ == '__main__':
    main()