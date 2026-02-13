export function tokenize(input: string) {
  const re = /"[^"]*"|'[^']*'|\S+/g
  const tokens = input.match(re) || []
  return tokens.map((t) => t.replace(/^['"]|['"]$/g, ''))
}

