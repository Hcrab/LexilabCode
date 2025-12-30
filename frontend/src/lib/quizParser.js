export const parseAndCategorizeQuizData = (items) => {
  const defs = [];
  const blanks = [];
  const sentences = [];
  (items || []).forEach(it => {
    const id = it.id || `${it.word}-${it.type}-${Math.random().toString(36).slice(2,8)}`;
    const def = it.definition || '';
    if (def) defs.push({ word: it.word, definition: def });
    if (it.type === 'fill-in-the-blank') {
      blanks.push({ id, type: 'fill-in-the-blank', word: it.word, prompt: it.sentence || it.prompt || '' });
    } else if (it.type === 'sentence') {
      sentences.push({ id, type: 'sentence', word: it.word, definition: def });
    }
  });
  return { definitions: defs, fillInTheBlanks: blanks, sentences };
};
