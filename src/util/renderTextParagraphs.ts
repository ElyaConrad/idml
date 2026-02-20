import { CharacterStyleInput } from '../controllers/CharacterStyle';
import { ParagraphStyleInput } from '../controllers/ParagraphStyle';
import { ParagraphOutput } from '../main';

export type ParagraphLine = {
  paragraph: ParagraphOutput;
  lines: ParagraphOutput['features'][number][][];
};

function splitParagraphFeatures(paragraph: ParagraphOutput, delimiter: string): ParagraphOutput['features'][number][][] {
  const result: ParagraphOutput['features'][number][][] = [[]];
  for (const feature of paragraph.features) {
    const [currLineSpan, ...otherLines] = feature.content.split(delimiter);
    result[result.length - 1].push({
      content: currLineSpan,
      appliedCharacterStyle: feature.appliedCharacterStyle,
      localCharacterStyleInput: feature.localCharacterStyleInput,
    });
    for (const element of otherLines) {
      result.push([
        {
          content: element,
          appliedCharacterStyle: feature.appliedCharacterStyle,
          localCharacterStyleInput: feature.localCharacterStyleInput,
        },
      ]);
    }
  }

  return result;
}

// This function renders a given list of paragraphs to more svg-like text elements (SVG does not allow line breaks so we're rendering them separately)
export function renderTextParagraphs(paragraphs: ParagraphOutput[]): ParagraphLine[] {
  return paragraphs.map((paragraph) => {
    return {
      paragraph,
      lines: splitParagraphFeatures(paragraph, '\n'),
    };
  });
}

export function renderTextParagraphsToText(paragraphs: ParagraphOutput[]): string {
  let result = '';
  for (const paragraph of paragraphs) {
    for (const feature of paragraph.features) {
      result += feature.content;
    }
  }
  return result;
}
