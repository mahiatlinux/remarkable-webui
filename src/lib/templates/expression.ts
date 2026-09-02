export type Scope = Record<string, number>;

type Token =
	| { kind: 'number'; value: number }
	| { kind: 'ident'; value: string }
	| { kind: 'op'; value: string };

const OPERATORS = [
	'<=',
	'>=',
	'==',
	'!=',
	'&&',
	'||',
	'+',
	'-',
	'*',
	'/',
	'%',
	'<',
	'>',
	'?',
	':',
	'(',
	')',
	'!'
];

function tokenize(source: string): Token[] {
	const tokens: Token[] = [];
	let i = 0;
	while (i < source.length) {
		const ch = source[i];
		if (/\s/.test(ch)) {
			i += 1;
			continue;
		}
		if (/[0-9.]/.test(ch)) {
			const match = /^[0-9]*\.?[0-9]+(e[+-]?[0-9]+)?/i.exec(source.slice(i))!;
			tokens.push({ kind: 'number', value: Number(match[0]) });
			i += match[0].length;
			continue;
		}
		if (/[A-Za-z_]/.test(ch)) {
			const match = /^[A-Za-z_][A-Za-z0-9_]*/.exec(source.slice(i))!;
			tokens.push({ kind: 'ident', value: match[0] });
			i += match[0].length;
			continue;
		}
		const op = OPERATORS.find((candidate) => source.startsWith(candidate, i));
		if (!op) throw new Error(`Unexpected character "${ch}" in expression "${source}"`);
		tokens.push({ kind: 'op', value: op });
		i += op.length;
	}
	return tokens;
}

class Parser {
	private pos = 0;
	constructor(
		private tokens: Token[],
		private scope: Scope
	) {}

	parse(): number {
		const value = this.ternary();
		if (this.pos < this.tokens.length) throw new Error('Unexpected trailing tokens in expression');
		return value;
	}

	private peek(op: string): boolean {
		const token = this.tokens[this.pos];
		return token?.kind === 'op' && token.value === op;
	}

	private take(op: string): boolean {
		if (!this.peek(op)) return false;
		this.pos += 1;
		return true;
	}

	private ternary(): number {
		const condition = this.or();
		if (!this.take('?')) return condition;
		const yes = this.ternary();
		if (!this.take(':')) throw new Error('Expected ":" in expression');
		const no = this.ternary();
		return condition ? yes : no;
	}

	private or(): number {
		let left = this.and();
		while (this.take('||')) left = left || this.and() ? 1 : 0;
		return left;
	}

	private and(): number {
		let left = this.equality();
		while (this.take('&&')) {
			const right = this.equality();
			left = left && right ? 1 : 0;
		}
		return left;
	}

	private equality(): number {
		let left = this.comparison();
		for (;;) {
			if (this.take('==')) left = left === this.comparison() ? 1 : 0;
			else if (this.take('!=')) left = left !== this.comparison() ? 1 : 0;
			else return left;
		}
	}

	private comparison(): number {
		let left = this.additive();
		for (;;) {
			if (this.take('<=')) left = left <= this.additive() ? 1 : 0;
			else if (this.take('>=')) left = left >= this.additive() ? 1 : 0;
			else if (this.take('<')) left = left < this.additive() ? 1 : 0;
			else if (this.take('>')) left = left > this.additive() ? 1 : 0;
			else return left;
		}
	}

	private additive(): number {
		let left = this.multiplicative();
		for (;;) {
			if (this.take('+')) left += this.multiplicative();
			else if (this.take('-')) left -= this.multiplicative();
			else return left;
		}
	}

	private multiplicative(): number {
		let left = this.unary();
		for (;;) {
			if (this.take('*')) left *= this.unary();
			else if (this.take('/')) left /= this.unary();
			else if (this.take('%')) left %= this.unary();
			else return left;
		}
	}

	private unary(): number {
		if (this.take('-')) return -this.unary();
		if (this.take('+')) return this.unary();
		if (this.take('!')) return this.unary() ? 0 : 1;
		return this.primary();
	}

	private primary(): number {
		const token = this.tokens[this.pos++];
		if (!token) throw new Error('Unexpected end of expression');
		if (token.kind === 'number') return token.value;
		if (token.kind === 'ident') {
			const value = this.scope[token.value];
			if (value === undefined) throw new Error(`Unknown identifier "${token.value}"`);
			return value;
		}
		if (token.value === '(') {
			const value = this.ternary();
			if (!this.take(')')) throw new Error('Expected ")" in expression');
			return value;
		}
		throw new Error(`Unexpected "${token.value}" in expression`);
	}
}

export function evaluate(expression: string | number | boolean, scope: Scope): number {
	if (typeof expression === 'number') return expression;
	if (typeof expression === 'boolean') return expression ? 1 : 0;
	return new Parser(tokenize(expression), scope).parse();
}
