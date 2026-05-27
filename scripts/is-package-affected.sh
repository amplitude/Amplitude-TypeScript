#!/bin/sh
pnpm exec nx show projects --affected --base=main --head=HEAD | grep "$1"
if [ $? -eq 0 ]; then
  exit 0
else
  exit 1
fi