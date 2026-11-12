#!/usr/bin/env node
// Reads a caption on stdin, writes it back with every link to our site tagged
// ?src=<tag> (bare domain mentions included). Used by telegram-channel-post.yml,
// the one path every channel post takes, so a caption written once for both
// Instagram and the channel still reports channel taps as src=tgch.
//   printf '%s' "$CAPTION" | node scripts/tag-caption.mjs tgch
import { tagLinksInText } from '../shared/attribution.mjs';
const tag = process.argv[2];
let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (c) => { input += c; });
process.stdin.on('end', () => { process.stdout.write(tagLinksInText(input, tag, { bare: true })); });
