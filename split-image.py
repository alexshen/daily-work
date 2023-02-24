#! /usr/bin/env python3

from PIL import Image, ImageColor
import argparse
import sys
import os
from collections import Counter


def is_transparent_line(im, y, bg_color, threshold):
    pa = im.load()
    num_opaque_pixels = 0
    num_transparent_color = 0
    for x in range(im.size[0]):
        c = pa[x, y]
        # skip transparent pixels
        if len(c) == 4 and c[3] == 0:
            continue
        num_opaque_pixels += 1
        if pa[x, y][:3] == bg_color:
            num_transparent_color += 1
    return num_transparent_color / num_opaque_pixels > threshold

# try to split the image at a location within [top, bottom]
# return the splitting location
# NOTE: if splitting is not possible, bottom is returned


def try_split(im, top, bottom, bg_color, threshold):
    if top > bottom:
        raise ValueError('top > bottom')

    y = bottom - 1
    while y > top:
        if is_transparent_line(im, y, bg_color, threshold):
            return y + 1
        y -= 1
    return bottom


def rgb(s):
    if len(s) != 6:
        raise ValueError('Color must be in RRGGBB')
    return ImageColor.getrgb('#' + s)
    

def most_common_color(im):
    cd = Counter(list(im.getdata()))
    return cd.most_common(1)[0][0]

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('height', type=int, help='maximum height of a split')
    parser.add_argument('-o', '--overlap', default=0, type=int,
                        help='number of pixels overlapped between adjcent splits')
    parser.add_argument('-c', '--transparent-color', default=None, type=rgb, 
                        help='trasparent color in RRGGBB, the default is set to the most common color')
    parser.add_argument('-t', '--threshold', default=1, type=float,
                        help='minimum threashold for a line to be considered transparent')
    parser.add_argument('input', help='input image')
    parser.add_argument('output', help='printf style output file name pattern')
    args = parser.parse_args()
    os.path.splitext(args.output)[1].lower()

    im = Image.open(args.input)
    if args.transparent_color is not None:
        bg_color = args.transparent_color
    else:
        bg_color = most_common_color(im)
    bg_color = bg_color[:3]
    print('bg color: {0}'.format(bg_color))
    width, height = im.size
    print('size: {0}'.format(im.size))
    y = 0
    i = 0
    while y < height:
        # check if we can split at y
        if y + args.height < height:
            spl = try_split(im, y, y + args.height, bg_color, args.threshold)
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
