#! /usr/bin/env python3


import sys

_WEIGHTS = (7,9,10,5,8,4,2,1,6,3,7,9,10,5,8,4,2)
_CHECKSUMS = ('1','0','X','9','8','7','6','5','4','3','2')

def is_valid(id_number):
    if len(id_number) != 18:
        return False

    checksum = 0
    for i in range(0, 17):
        checksum += int(id_number[i]) * _WEIGHTS[i]
    return _CHECKSUMS[checksum % 11] == id_number[-1]


if __name__ == '__main__':
    for input in sys.stdin:
        input = input.strip()
        if not is_valid(input):
            print(input)