// Computes the next prerelease number for a given base version and tag.
// Reads ALL_VERSIONS (JSON array string), BASE_VERSION, and TAG_NAME from env vars.
// Outputs the next integer to stdout.
const raw = JSON.parse(process.env.ALL_VERSIONS);
const versions = Array.isArray(raw) ? raw : [raw];
const prefix = process.env.BASE_VERSION + '-' + process.env.TAG_NAME + '.';
const nums = versions
  .filter(v => v.startsWith(prefix))
  .map(v => parseInt(v.slice(prefix.length), 10))
  .filter(n => !isNaN(n));
console.log(nums.length > 0 ? Math.max(...nums) + 1 : 1);
