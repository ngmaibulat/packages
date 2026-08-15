// Reformats every GFM markdown table in `text` so its "|" column separators
// line up visually in the raw source — purely a whitespace-padding pass; the
// rendered HTML is unaffected either way (marked/CommonMark tables ignore
// intra-cell whitespace). Table blocks are detected line-by-line (a row +
// a matching delimiter row + zero or more following rows) and rewritten
// independently; everything else — prose, code fences, other tables —
// passes through untouched. Known limitation: a "|" inside a backtick code
// span within a cell (e.g. "`a|b`") is still treated as a cell delimiter,
// unlike a full CommonMark table-cell tokenizer — not worth the complexity
// for a comment-formatting convenience.

type Alignment = 'left' | 'right' | 'center' | 'none';

const DELIMITER_CELL_RE = /^:?-+:?$/;
const FENCE_RE = /^\s*(```|~~~)/;

function splitRow(line: string): string[] {
	let trimmed = line.trim();
	if (trimmed.startsWith('|')) trimmed = trimmed.slice(1);
	if (trimmed.endsWith('|')) trimmed = trimmed.slice(0, -1);

	const cells: string[] = [];
	let current = '';
	for (let i = 0; i < trimmed.length; i++) {
		const ch = trimmed[i];
		if (ch === '\\' && trimmed[i + 1] === '|') {
			current += '|';
			i++;
			continue;
		}
		if (ch === '|') {
			cells.push(current.trim());
			current = '';
			continue;
		}
		current += ch;
	}
	cells.push(current.trim());
	return cells;
}

function isTableRow(line: string): boolean {
	return line.includes('|') && line.trim().length > 0;
}

function parseDelimiterRow(line: string): Alignment[] | null {
	const cells = splitRow(line);
	if (cells.length === 0) return null;
	const alignments: Alignment[] = [];
	for (const cell of cells) {
		if (!DELIMITER_CELL_RE.test(cell)) return null;
		const left = cell.startsWith(':');
		const right = cell.endsWith(':');
		alignments.push(left && right ? 'center' : right ? 'right' : left ? 'left' : 'none');
	}
	return alignments;
}

function pad(text: string, width: number, alignment: Alignment): string {
	const gap = Math.max(0, width - text.length);
	if (alignment === 'right') return ' '.repeat(gap) + text;
	if (alignment === 'center') {
		const leftGap = Math.floor(gap / 2);
		const rightGap = gap - leftGap;
		return ' '.repeat(leftGap) + text + ' '.repeat(rightGap);
	}
	return text + ' '.repeat(gap);
}

function buildDelimiterCell(width: number, alignment: Alignment): string {
	const reserved = alignment === 'center' ? 2 : alignment === 'none' ? 0 : 1;
	const dashes = '-'.repeat(Math.max(1, width - reserved));
	if (alignment === 'center') return `:${dashes}:`;
	if (alignment === 'left') return `:${dashes}`;
	if (alignment === 'right') return `${dashes}:`;
	return dashes;
}

// The minimum width a column needs to hold its delimiter syntax — a
// colon-bearing alignment marker takes more room than a bare "-". Content
// almost always exceeds this anyway; it only matters for a genuinely
// empty/very short column.
function minWidthForAlignment(alignment: Alignment): number {
	if (alignment === 'center') return 3;
	if (alignment === 'none') return 1;
	return 2;
}

function formatTableBlock(lines: string[]): string[] {
	const header = splitRow(lines[0]);
	const alignments = parseDelimiterRow(lines[1])!;
	const columnCount = header.length;
	const bodyRows = lines.slice(2).map(splitRow);

	const normalizedAlignments = Array.from(
		{ length: columnCount },
		(_, i) => alignments[i] ?? 'none'
	);
	const allRows = [header, ...bodyRows].map((row) => {
		// Missing trailing cells become empty, extra cells are dropped — the
		// same tolerant behavior GFM's own table parser has for ragged rows.
		const normalized = row.slice(0, columnCount);
		while (normalized.length < columnCount) normalized.push('');
		return normalized;
	});

	const widths = Array.from({ length: columnCount }, (_, col) =>
		Math.max(
			minWidthForAlignment(normalizedAlignments[col]),
			...allRows.map((row) => row[col].length)
		)
	);

	const renderRow = (row: string[]) =>
		`| ${row.map((cell, i) => pad(cell, widths[i], normalizedAlignments[i])).join(' | ')} |`;

	const delimiterRow = `| ${widths
		.map((w, i) => buildDelimiterCell(w, normalizedAlignments[i]))
		.join(' | ')} |`;

	return [renderRow(allRows[0]), delimiterRow, ...allRows.slice(1).map(renderRow)];
}

export function formatMarkdownTables(text: string): string {
	const lines = text.split('\n');
	const output: string[] = [];
	let inFence = false;
	let i = 0;

	while (i < lines.length) {
		const line = lines[i];

		if (FENCE_RE.test(line)) {
			inFence = !inFence;
			output.push(line);
			i++;
			continue;
		}

		if (!inFence && i + 1 < lines.length && isTableRow(line)) {
			const alignments = parseDelimiterRow(lines[i + 1]);
			if (alignments && alignments.length === splitRow(line).length) {
				let end = i + 2;
				while (end < lines.length && isTableRow(lines[end])) end++;
				output.push(...formatTableBlock(lines.slice(i, end)));
				i = end;
				continue;
			}
		}

		output.push(line);
		i++;
	}

	return output.join('\n');
}

const MAX_TABLE_DIMENSION = 20;

/**
 * A blank COLS×ROWS markdown table ("Header 1"/"Header 2"/… header cells,
 * empty data cells), pre-aligned via formatMarkdownTables — used by the
 * "Insert table" picker (a plain, deterministic UI control, unlike the
 * Monaco completion-widget approach this replaced for choosing a table
 * size: see TablePicker.svelte). cols/rows are clamped to [1, 20] and
 * floored so a bad caller-supplied value can't produce a degenerate table.
 */
export function buildMarkdownTable(cols: number, rows: number): string {
	const c = Math.max(1, Math.min(MAX_TABLE_DIMENSION, Math.floor(cols)));
	const r = Math.max(1, Math.min(MAX_TABLE_DIMENSION, Math.floor(rows)));

	const header = Array.from({ length: c }, (_, i) => `Header ${i + 1}`);
	const separator = Array.from({ length: c }, () => '---');
	const body = Array.from({ length: r }, () => Array.from({ length: c }, () => ''));
	const renderRow = (cells: string[]) => `| ${cells.join(' | ')} |`;

	const raw = [renderRow(header), renderRow(separator), ...body.map(renderRow)].join('\n');
	return formatMarkdownTables(raw);
}
