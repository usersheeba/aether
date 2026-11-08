import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  createTypographyPlugin,
  replaceQuotes,
  replaceDashes,
  addNonBreakingSpaces,
  applyTypography,
  applyTypographyToPastedText,
  transformTypedText,
} from '../src/editor/typography.ts';
import { Schema } from '@tiptap/pm/model';
import { EditorState } from '@tiptap/pm/state';

test('replaceDashes: double hyphen becomes em dash', () => {
  assert.strictEqual(replaceDashes('text--text'), 'text—text');
  assert.strictEqual(replaceDashes('text---text'), 'text—text');
  assert.strictEqual(replaceDashes('no dashes here'), 'no dashes here');
});

test('replaceQuotes: English smart quotes', () => {
  // First double quote should be opening
  const result = replaceQuotes('He said "hello"', 'en');
  assert.ok(result.includes('“'), `Expected opening curly quote, got: ${result}`);
  assert.ok(result.includes('”'), `Expected closing curly quote, got: ${result}`);
  assert.ok(!result.includes('"'), `Straight quotes should be replaced, got: ${result}`);
  assert.strictEqual(replaceQuotes("don't", 'en'), 'don’t');
});

test('replaceQuotes: Russian guillemets', () => {
  const result = replaceQuotes('Он сказал "привет"', 'ru');
  assert.ok(result.includes('«'), `Expected opening guillemet, got: ${result}`);
  assert.ok(result.includes('»'), `Expected closing guillemet, got: ${result}`);
  assert.ok(!result.includes('"'), `Straight quotes should be replaced, got: ${result}`);
});

test('addNonBreakingSpaces: Russian prepositions', () => {
  const result = addNonBreakingSpaces('в доме на столе с другом', 'ru');
  assert.ok(result.includes('в\u00A0доме'), `Expected NBSP after в, got: ${result}`);
  assert.ok(result.includes('на\u00A0столе'), `Expected NBSP after на, got: ${result}`);
  assert.ok(result.includes('с\u00A0другом'), `Expected NBSP after с, got: ${result}`);
});

test('addNonBreakingSpaces: English no NBSP', () => {
  const result = addNonBreakingSpaces('in the house on the table', 'en');
  assert.strictEqual(result, 'in the house on the table');
});

test('applyTypography: combined transformations', () => {
  const result = applyTypography('He said "hello"--goodbye', 'en');
  assert.ok(result.includes('“'), `Expected opening quote, got: ${result}`);
  assert.ok(result.includes('”'), `Expected closing quote, got: ${result}`);
  assert.ok(result.includes('—'), `Expected em dash, got: ${result}`);
});

test('applyTypographyToPastedText: applies transformations', () => {
  const result = applyTypographyToPastedText('He said "hello"--goodbye', 'en');
  assert.ok(result.includes('“'), `Expected opening quote, got: ${result}`);
  assert.ok(result.includes('—'), `Expected em dash, got: ${result}`);
});

test('transformTypedText: converts quotes based on cursor context', () => {
  assert.deepStrictEqual(transformTypedText('"', '', 'ru'), { replaceBefore: 0, replacement: '«' });
  assert.deepStrictEqual(transformTypedText('"', 'слово', 'ru'), { replaceBefore: 0, replacement: '»' });
  assert.deepStrictEqual(transformTypedText('"', '', 'en'), { replaceBefore: 0, replacement: '“' });
});

test('transformTypedText: converts dashes and Russian preposition spaces while typing', () => {
  assert.deepStrictEqual(transformTypedText('-', 'текст-', 'ru'), { replaceBefore: 1, replacement: '—' });
  assert.deepStrictEqual(transformTypedText(' ', 'в', 'ru'), { replaceBefore: 0, replacement: '\u00A0' });
  assert.strictEqual(transformTypedText(' ', 'дом', 'ru'), null);
});

test('typography plugin: applies live input and leaves IME composition untouched', () => {
  const schema = new Schema({
    nodes: {
      doc: { content: 'paragraph+' },
      paragraph: { content: 'text*' },
      text: { inline: true },
    },
  });
  let state = EditorState.create({
    schema,
    doc: schema.node('doc', null, [schema.node('paragraph', null, [schema.text('слово')])]),
  });
  const view = {
    composing: false,
    get state() {
      return state;
    },
    dispatch(transaction) {
      state = state.apply(transaction);
    },
  };
  const plugin = createTypographyPlugin(() => 'ru');
  const handleTextInput = plugin.props.handleTextInput;

  assert.strictEqual(handleTextInput(view, 6, 6, '"'), true);
  assert.strictEqual(state.doc.textContent, 'слово»');
  plugin.props.handleDOMEvents.beforeinput(view, { isComposing: true });
  assert.strictEqual(handleTextInput(view, 7, 7, '"'), false);
  assert.strictEqual(state.doc.textContent, 'слово»');
  plugin.props.handleDOMEvents.beforeinput(view, { isComposing: false });
  view.composing = true;
  assert.strictEqual(handleTextInput(view, 7, 7, '"'), false);
  assert.strictEqual(state.doc.textContent, 'слово»');
});
