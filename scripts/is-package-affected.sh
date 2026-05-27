#!/bin/sh
pnpm exec nx show projects --affected --base=9ef2365e1f4645a675581fe1a4e98e65bb9ead38 --head=HEAD | grep "$1"
if [ $? -eq 0 ]; then
  exit 0
else
  exit 1
fi