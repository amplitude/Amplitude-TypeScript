TS_OBJS=$(shell find src -name '*.ts')

all: lib/cjs/index.js lib/esm/index.js lib/scripts/session-replay.d.ts

lib/scripts/session-replay.d.ts: $(TS_OBJS)
	yarn bundle
lib/cjs/index.js: $(TS_OBJS)
	yarn build:es5
lib/esm/index.js: $(TS_OBJS)
	yarn build:esm