import { describe, expect, it } from 'vitest';
import { formatMarkdownTables, buildMarkdownTable } from '../../lib/editor/formatMarkdownTables';

describe('formatMarkdownTables', () => {
	it('pads a ragged table so every column lines up', () => {
		const input = ['| a | bbbbbb |', '| --- | --- |', '| x | y |'].join('\n');
		expect(formatMarkdownTables(input)).toBe(
			['| a | bbbbbb |', '| - | ------ |', '| x | y      |'].join('\n')
		);
	});

	it('preserves left/right/center alignment markers', () => {
		const input = ['| left | right | center |', '| :--- | ---: | :---: |', '| a | b | c |'].join(
			'\n'
		);
		expect(formatMarkdownTables(input)).toBe(
			['| left | right | center |', '| :--- | ----: | :----: |', '| a    |     b |   c    |'].join(
				'\n'
			)
		);
	});

	it("doesn't inflate a column narrower than what its alignment marker needs", () => {
		// A bare (unaligned) 1-character column needs no more than a single dash.
		const input = ['| a |', '| - |', '| b |'].join('\n');
		expect(formatMarkdownTables(input)).toBe(input);
	});

	it('pads a missing trailing cell and drops an extra one against the header width', () => {
		const input = ['| a | b |', '| --- | --- |', '| only |', '| x | y | extra |'].join('\n');
		expect(formatMarkdownTables(input)).toBe(
			['| a    | b |', '| ---- | - |', '| only |   |', '| x    | y |'].join('\n')
		);
	});

	it('formats multiple tables independently and leaves prose between them untouched', () => {
		const input = [
			'Intro text.',
			'',
			'| a | b |',
			'| --- | --- |',
			'| 1 | 22 |',
			'',
			'Some more text.',
			'',
			'| xx | y |',
			'| --- | --- |',
			'| 1 | 2 |'
		].join('\n');

		expect(formatMarkdownTables(input)).toBe(
			[
				'Intro text.',
				'',
				'| a | b  |',
				'| - | -- |',
				'| 1 | 22 |',
				'',
				'Some more text.',
				'',
				'| xx | y |',
				'| -- | - |',
				'| 1  | 2 |'
			].join('\n')
		);
	});

	it('does not touch pipe-heavy content inside a fenced code block', () => {
		const input = ['```', '| not | a | table |', '| --- | --- |', '```'].join('\n');
		expect(formatMarkdownTables(input)).toBe(input);
	});

	it('returns text with no tables unchanged', () => {
		const input = 'Just a comment with no tables, and a | that is not one.';
		expect(formatMarkdownTables(input)).toBe(input);
	});

	it('accepts input rows without leading/trailing pipes and adds them on output', () => {
		const input = ['Col1 | Col2', '--- | ---', 'a | bb'].join('\n');
		expect(formatMarkdownTables(input)).toBe(
			['| Col1 | Col2 |', '| ---- | ---- |', '| a    | bb   |'].join('\n')
		);
	});

	it('pads Cyrillic content by character count', () => {
		const input = ['| Имя | Роль |', '| --- | --- |', '| Иван | Инженер |'].join('\n');
		expect(formatMarkdownTables(input)).toBe(
			['| Имя  | Роль    |', '| ---- | ------- |', '| Иван | Инженер |'].join('\n')
		);
	});
});

describe('buildMarkdownTable', () => {
	it('builds a pre-aligned blank table with numbered headers', () => {
		expect(buildMarkdownTable(3, 2)).toBe(
			[
				'| Header 1 | Header 2 | Header 3 |',
				'| -------- | -------- | -------- |',
				'|          |          |          |',
				'|          |          |          |'
			].join('\n')
		);
	});

	it('supports a single cell', () => {
		expect(buildMarkdownTable(1, 1)).toBe(
			['| Header 1 |', '| -------- |', '|          |'].join('\n')
		);
	});

	it('clamps out-of-range dimensions to [1, 20]', () => {
		const result = buildMarkdownTable(0, 99);
		const lines = result.split('\n');
		expect(lines).toHaveLength(2 + 20); // header + separator + 20 data rows
		expect(lines[0]).toBe('| Header 1 |');
	});
});
