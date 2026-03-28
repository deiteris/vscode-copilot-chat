/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { describe, expect, test, beforeEach } from 'vitest';
import { InlineThinkTagParser } from '../../common/inlineThinkTagParser';

describe('InlineThinkTagParser', () => {
	let parser: InlineThinkTagParser;

	beforeEach(() => {
		parser = new InlineThinkTagParser();
	});

	describe('basic parsing', () => {
		test('passes through plain text as content', () => {
			const result = parser.processChunk('Hello world');
			expect(result).toEqual([{ type: 'content', text: 'Hello world' }]);
		});

		test('extracts a complete think block', () => {
			const result = parser.processChunk('<think>reasoning here</think>response text');
			expect(result).toEqual([
				{ type: 'thinking', text: 'reasoning here' },
				{ type: 'content', text: 'response text' },
			]);
		});

		test('handles think block at the end of content', () => {
			const result = parser.processChunk('before<think>reasoning</think>');
			expect(result).toEqual([
				{ type: 'content', text: 'before' },
				{ type: 'thinking', text: 'reasoning' },
			]);
		});

		test('handles think block with no surrounding content', () => {
			const result = parser.processChunk('<think>just thinking</think>');
			expect(result).toEqual([
				{ type: 'thinking', text: 'just thinking' },
			]);
		});

		test('handles multiple think blocks', () => {
			const result = parser.processChunk('<think>first</think>middle<think>second</think>end');
			expect(result).toEqual([
				{ type: 'thinking', text: 'first' },
				{ type: 'content', text: 'middle' },
				{ type: 'thinking', text: 'second' },
				{ type: 'content', text: 'end' },
			]);
		});

		test('handles empty think block', () => {
			const result = parser.processChunk('<think></think>text');
			expect(result).toEqual([
				{ type: 'content', text: 'text' },
			]);
		});
	});

	describe('streaming across chunks', () => {
		test('handles open tag split across chunks', () => {
			const r1 = parser.processChunk('hello<thi');
			expect(r1).toEqual([{ type: 'content', text: 'hello' }]);

			const r2 = parser.processChunk('nk>reasoning</think>after');
			expect(r2).toEqual([
				{ type: 'thinking', text: 'reasoning' },
				{ type: 'content', text: 'after' },
			]);
		});

		test('handles close tag split across chunks', () => {
			const r1 = parser.processChunk('<think>reasoning</th');
			expect(r1).toEqual([{ type: 'thinking', text: 'reasoning' }]);

			const r2 = parser.processChunk('ink>after');
			expect(r2).toEqual([{ type: 'content', text: 'after' }]);
		});

		test('handles content arriving one character at a time', () => {
			const fullText = '<think>hi</think>ok';
			const allSegments = [];
			for (const ch of fullText) {
				allSegments.push(...parser.processChunk(ch));
			}
			// Combine adjacent segments of the same type
			const merged = mergeSegments(allSegments);
			expect(merged).toEqual([
				{ type: 'thinking', text: 'hi' },
				{ type: 'content', text: 'ok' },
			]);
		});

		test('handles think block open at end of chunk without close', () => {
			const r1 = parser.processChunk('<think>I am thinking');
			expect(r1).toEqual([{ type: 'thinking', text: 'I am thinking' }]);
			expect(parser.isInsideThinkBlock).toBe(true);

			const r2 = parser.processChunk(' more thoughts</think>done');
			expect(r2).toEqual([
				{ type: 'thinking', text: ' more thoughts' },
				{ type: 'content', text: 'done' },
			]);
			expect(parser.isInsideThinkBlock).toBe(false);
		});

		test('handles unclosed think block (interleaved thinking)', () => {
			const r1 = parser.processChunk('<think>reasoning without close tag');
			expect(r1).toEqual([{ type: 'thinking', text: 'reasoning without close tag' }]);
			expect(parser.isInsideThinkBlock).toBe(true);

			// Flush treats remaining buffer as thinking
			const flushed = parser.flush();
			expect(flushed).toEqual([]);
		});
	});

	describe('flush', () => {
		test('flushes remaining content when outside think block', () => {
			// Buffer a partial open tag
			parser.processChunk('hello<thi');
			const flushed = parser.flush();
			expect(flushed).toEqual([{ type: 'content', text: '<thi' }]);
		});

		test('flushes remaining content when inside think block', () => {
			parser.processChunk('<think>partial reasoning');
			const flushed = parser.flush();
			expect(flushed).toEqual([]);
		});

		test('flush on empty buffer returns nothing', () => {
			const flushed = parser.flush();
			expect(flushed).toEqual([]);
		});

		test('flushes partial close tag as thinking', () => {
			parser.processChunk('<think>reasoning</th');
			const flushed = parser.flush();
			expect(flushed).toEqual([{ type: 'thinking', text: '</th' }]);
		});
	});

	describe('isInsideThinkBlock', () => {
		test('starts outside', () => {
			expect(parser.isInsideThinkBlock).toBe(false);
		});

		test('inside after open tag', () => {
			parser.processChunk('<think>');
			expect(parser.isInsideThinkBlock).toBe(true);
		});

		test('outside after close tag', () => {
			parser.processChunk('<think>text</think>');
			expect(parser.isInsideThinkBlock).toBe(false);
		});

		test('tracks state across multiple chunks', () => {
			parser.processChunk('<think>first');
			expect(parser.isInsideThinkBlock).toBe(true);

			parser.processChunk('</think>middle');
			expect(parser.isInsideThinkBlock).toBe(false);

			parser.processChunk('<think>second');
			expect(parser.isInsideThinkBlock).toBe(true);
		});
	});

	describe('edge cases', () => {
		test('does not match similar but different tags like <thinking>', () => {
			const result = parser.processChunk('<thinking>not a tag</thinking>');
			// <thinking> is NOT <think>, so it's treated as plain content
			expect(result).toEqual([
				{ type: 'content', text: '<thinking>not a tag</thinking>' },
			]);
		});

		test('handles <think> appearing as literal text after a think block', () => {
			const result = parser.processChunk('<think>real thinking</think>The tag is <think>');
			expect(result).toEqual([
				{ type: 'thinking', text: 'real thinking' },
				{ type: 'content', text: 'The tag is ' },
			]);
			// Parser is now inside a new think block
			expect(parser.isInsideThinkBlock).toBe(true);
		});

		test('handles empty chunk', () => {
			const result = parser.processChunk('');
			expect(result).toEqual([]);
		});

		test('handles chunk that is exactly an open tag', () => {
			const result = parser.processChunk('<think>');
			expect(result).toEqual([]);
			expect(parser.isInsideThinkBlock).toBe(true);
		});

		test('handles chunk that is exactly a close tag', () => {
			parser.processChunk('<think>');
			const result = parser.processChunk('</think>');
			expect(result).toEqual([]);
			expect(parser.isInsideThinkBlock).toBe(false);
		});
	});
});

function mergeSegments(segments: { type: string; text: string }[]): { type: string; text: string }[] {
	const merged: { type: string; text: string }[] = [];
	for (const seg of segments) {
		if (merged.length > 0 && merged[merged.length - 1].type === seg.type) {
			merged[merged.length - 1].text += seg.text;
		} else {
			merged.push({ ...seg });
		}
	}
	return merged;
}
