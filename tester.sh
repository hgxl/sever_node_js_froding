#!/bin/sh

l_s=jot -r 1  2000 65000

ab -n 100 -c 10 `http://localhost:3000/?from=2.$l_s%3B48.$l_s&to=2.$l_s%3B48.$l_s` > test1.txt &
