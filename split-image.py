#! /usr/bin/env python3

from PIL import Image, ImageColor
import argparse
import sys
import os
import math
import functools
from collections import Counter


class Vector:

    def __init__(self, *args):
        if len(args) == 0:
            raise ValueError('Vector must have at least 1 component')
        self._v = list(args)

    @property
    def magnitude(self):
        return math.sqrt(
            functools.reduce(lambda state, x: state + x * x, self._v, 0))

    def normalize(self):
        mag = self.magnitude
        for i in range(len(self._v)):
            self._v[i] /= mag

    def normalized(self):
        v = Vector(*self._v)
        v.normalize()
        return v

    def __getitem__(self, index):
        return self._v[index]

    def __setitem__(self, index, v):
        self._v[index] = v

    def __len__(self):
        return len(self._v)

    def __imul__(self, x):
        for i in range(len(self._v)):
            self._v[i] *= x

    def __idiv__(self, x):
        self *= 1 / x

    def dot(self, other):
        if len(other) != len(self):
            raise ValueError('Dotting vectors with different lengths')
        return functools.reduce(lambda state, x: state + x[0] * x[1],
                                zip(self._v, other._v), 0)

    def __repr__(self):
        return repr(tuple(self._v))


def get_bg_color_density(im, y, bg_color: Vector, similarity):
    pa = im.load()
    num_opaque_pixels = 0
    num_bg_color = 0
    for x in range(im.size[0]):
        c = pa[x, y]
        # skip transparent pixels
        if len(c) == 4 and c[3] == 0:
            continue
        num_opaque_pixels += 1
        c = Vector(*pa[x, y][:3])
        c.normalize()
        if c.dot(bg_color) >= similarity:
            num_bg_color += 1
    return num_bg_color / num_opaque_pixels


# try to split the image at a location within [top, bottom]
# return the splitting location
# NOTE: if splitting is not possible, bottom is returned


def try_split(im, top, bottom, bg_color, threshold, similarity=1):
    if top > bottom:
        raise ValueError('top > bottom')

    y = bottom - 1
    while y > top:
        density = get_bg_color_density(im, y, bg_color, similarity)
        if density >= threshold:
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


def ranged_float(min_value, max_value, clamp=True):

    def impl(v):
        v = float(v)
        if clamp:
            v = min(max(v, min_value), max_value)
        elif v < min_value:
            raise ValueError(
                'Value must not be less than {0}'.format(min_value))
        elif v > max_value:
            raise ValueError(
                'Value must not be greater than {0}'.format(max_value))
        return v

    return impl


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('height', type=int, help='maximum height of a split')
    parser.add_argument(
        '-o',
        '--overlap',
        default=0,
        type=int,
        help='number of pixels overlapped between adjcent splits')
    parser.add_argument(
        '-c',
        '--transparent-color',
        default=None,
        type=rgb,
        help=
        'trasparent color in RRGGBB, the default is set to the most common color'
    )
    parser.add_argument(
        '-t',
        '--threshold',
        default=ranged_float(0, 1),
        type=float,
        help='minimum threashold for a line to be considered transparent')
    parser.add_argument(
        '-s',
        '--similarity',
        default=1,
        type=ranged_float(0, 1),
        help='the degree to which two colors are considered similar')
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
    normalized_bg_color = Vector(*bg_color).normalized()
    print('bg color: {0}, normalized: {1}'.format(bg_color,
                                                  normalized_bg_color))
    width, height = im.size
    print('size: {0}'.format(im.size))
    y = 0
    i = 0
    while y < height:
        # check if we can split at y
        if y + args.height < height:
            spl = try_split(im, y, y + args.height, normalized_bg_color,
                            args.threshold, args.similarity)
        else:
            spl = height
        split = im.crop((0, max(y - args.overlap,
                                0), width, min(spl + args.overlap, height)))
        fname = args.output % i
        split.save(fname)
        print(fname)
        y = spl
        i += 1


if __name__ == '__main__':
    main()
