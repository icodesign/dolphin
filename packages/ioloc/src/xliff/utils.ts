import { logger } from '@repo/base/logger';
import { ElementCompact, js2xml, xml2js } from 'xml-js';

import {
  Xliff1,
  Xliff1Body,
  Xliff1Element,
  Xliff1File,
  Xliff1Group,
  Xliff1Note,
  Xliff1Source,
  Xliff1Target,
  Xliff1TransUnit,
} from './xliff1-spec.js';
import {
  Element,
  File,
  Group,
  InlineElement,
  Note,
  Notes,
  Segment,
  Source,
  Target,
  Text,
  Unit,
  Xliff,
} from './xliff-spec.js';

export function elementAsText(element: Element | Xliff1Element | Text) {
  return js2xml(element, {
    compact: false,
    spaces: 0,
    textFn: (value) => {
      return value
        .replace(/&amp;/g, '&') // convert quote back before converting amp
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>');
    },
  });
}

export function textAsElement(text: string): (Element | Text)[] {
  const escaped = text
    .replace(/&/g, '&amp;') // convert amp first
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  const xml = `<root>${escaped}</root>`;
  const converted = xml2js(xml, {
    compact: false,
  });
  const root = converted.elements[0] as Element;
  return root.elements || [];
}

export function textAsTextElementOrInline(
  text: string,
): (Text | InlineElement)[] {
  const elements = textAsElement(text);
  var result: (Text | InlineElement)[] = [];
  for (const element of elements) {
    if (element.type === 'text') {
      result.push(element);
    } else if (element.type === 'element') {
      if (
        element.name === 'cp' ||
        element.name === 'ph' ||
        element.name === 'pc' ||
        element.name === 'sc' ||
        element.name === 'ec' ||
        element.name === 'mrk' ||
        element.name === 'sm' ||
        element.name === 'em'
      ) {
        result.push(element as InlineElement);
      } else {
        logger.warn(`Unknown inline element ${element.name}`);
      }
    }
  }
  return result;
}

export function convertV1toV2(
  v1: Xliff1,
  sourceLanguage: string,
  targetLanguage: string,
): Xliff {
  if (v1.elements && v1.elements.length > 0) {
    let v1Files: File[] = [];
    const v1File = v1.elements[0] as Xliff1File;
    for (const v1File of v1.elements) {
      const bodyUnits = v1File.elements.filter(
        (e) => e.name === 'body',
      ) as Xliff1Body[];
      let fileElements = [];
      for (const bodyUnit of bodyUnits) {
        for (const element of bodyUnit.elements) {
          if (element.name === 'bin-unit') {
            continue;
          }
          const converted = convertV1BodyElementToV2(element);
          if (converted) {
            fileElements.push(converted);
          }
        }
      }
      v1Files.push({
        type: 'element',
        name: 'file',
        attributes: {
          id: v1File.attributes.original,
          original: v1File.attributes.original,
        },
        elements: fileElements,
      });
    }
    let v2: Xliff = {
      name: 'xliff',
      type: 'element',
      attributes: {
        version: '2.0',
        srcLang: v1File.attributes['source-language'],
        trgLang: v1File.attributes['target-language'],
        'xml:space': v1File.attributes['xml:space'],
        xmlns: 'urn:oasis:names:tc:xliff:document:2.0',
      },
      elements: v1Files,
    };
    return v2;
  } else {
    return {
      name: 'xliff',
      type: 'element',
      attributes: {
        version: '2.0',
        srcLang: sourceLanguage,
        trgLang: targetLanguage,
        xmlns: 'urn:oasis:names:tc:xliff:document:2.0',
      },
      elements: [],
    };
  }
}

function convertV1BodyElementToV2(
  element: Xliff1Group | Xliff1TransUnit,
): Group | Unit | undefined {
  if (element.name === 'group') {
    const elements = element.elements;
    if (!elements || elements.length === 0) {
      return;
    }
    const units = elements.filter(
      (e) => e.name === 'trans-unit',
    ) as Xliff1TransUnit[];
    const groupElements = units
      .flatMap((unit) => convertV1BodyElementToV2(unit))
      .filter((e) => e !== undefined) as (Group | Unit)[];
    const groupId = element.attributes.id;
    if (!groupId) {
      logger.warn(`No id in group`);
      return;
    }
    let group: Group = {
      name: 'group',
      type: 'element',
      attributes: {
        id: element.attributes.id || '',
      },
      elements: groupElements,
    };
    return group;
  } else if (element.name === 'trans-unit') {
    const sourceElements = element.elements;
    if (!sourceElements || sourceElements.length === 0) {
      return;
    }
    const source = sourceElements.find((e) => e.name === 'source') as
      | Xliff1Source
      | undefined;
    if (!source) {
      logger.warn(`No source in ${element.attributes.id}`);
      return undefined;
    }
    const v2Source: Source = {
      name: 'source',
      type: 'element',
      elements: [
        {
          type: 'text',
          text: elementAsText(source),
        },
      ],
    };
    const target = sourceElements.find((e) => e.name === 'target') as
      | Xliff1Target
      | undefined;
    let v2Target: Target | undefined;
    if (target) {
      v2Target = {
        name: 'target',
        type: 'element',
        elements: [
          {
            type: 'text',
            text: elementAsText(target),
          },
        ],
      };
    }
    const segment: Segment = {
      name: 'segment',
      type: 'element',
      attributes: {
        state: 'initial',
      },
      elements: v2Target !== undefined ? [v2Source, v2Target] : [v2Source],
    };
    const notes = sourceElements.filter(
      (e) => e.name === 'note',
    ) as Xliff1Note[];
    let v2Notes: Notes | undefined;
    if (notes.length > 0) {
      let noteElements: Note[] = [];
      for (const note of notes) {
        if (note.elements === undefined || note.elements.length === 0) {
          continue;
        }
        noteElements.push({
          name: 'note',
          type: 'element',
          elements: [
            {
              type: 'text',
              text: elementAsText(note),
            },
          ],
        });
      }
      if (noteElements.length > 0) {
        v2Notes = {
          name: 'notes',
          type: 'element',
          elements: noteElements,
        };
      }
    }
    const unitId = element.attributes.id;
    if (!unitId) {
      logger.warn(`No id in unit`);
      return;
    }
    let unit: Unit = {
      name: 'unit',
      type: 'element',
      attributes: {
        id: unitId,
      },
      elements: v2Notes !== undefined ? [v2Notes, segment] : [segment],
    };
    return unit;
  } else {
    return undefined;
  }
}

export function convertV2toV1(v2: Xliff): Xliff1 {
  const v1: Xliff1 = {
    name: 'xliff',
    type: 'element',
    attributes: {
      version: '1.2',
      'xmlns:xsi': 'http://www.w3.org/2001/XMLSchema-instance',
      xmlns: 'urn:oasis:names:tc:xliff:document:1.2',
      'xmlns:xliff': 'urn:oasis:names:tc:xliff:document:1.2',
      'xsi:schemaLocation':
        'urn:oasis:names:tc:xliff:document:1.2 xliff-core-1.2-transitional.xsd',
    },
    elements: [],
  };
  for (const v2File of v2.elements) {
    let v1Elements: (Xliff1Group | Xliff1TransUnit)[] = [];
    for (const v2FileElement of v2File.elements) {
      if (v2FileElement.name === 'group') {
        const v1Group = convertV2GroupToV1(v2FileElement);
        if (v1Group) {
          v1Elements.push(v1Group);
        }
      } else if (v2FileElement.name === 'unit') {
        const v1Unit = convertV2UnitToV1(v2FileElement);
        if (v1Unit) {
          v1Elements.push(v1Unit);
        }
      } else {
        logger.warn(`Unknown element ${v2FileElement.name}`);
      }
    }
    const v1File: Xliff1File = {
      name: 'file',
      type: 'element',
      attributes: {
        'source-language': v2.attributes.srcLang,
        'target-language': v2.attributes.trgLang,
        datatype: 'plaintext',
        original: v2File.attributes.id,
      },
      elements: [
        {
          name: 'body',
          type: 'element',
          attributes: {},
          elements: v1Elements,
        },
      ],
    };
    v1.elements.push(v1File);
  }
  return v1;
}

function convertV2GroupToV1(v2Group: Group): Xliff1Group | undefined {
  const v2Elements = v2Group.elements || [];
  const v2Units = v2Elements.filter((e) => e.name === 'unit') as Unit[];
  const v1Units = v2Units
    .flatMap((unit) => convertV2UnitToV1(unit))
    .filter((e) => e !== undefined) as Xliff1TransUnit[];
  const v1Group: Xliff1Group = {
    name: 'group',
    type: 'element',
    attributes: {
      id: v2Group.attributes.id || '',
    },
    elements: v1Units,
  };
  return v1Group;
}

function convertV2UnitToV1(v2Unit: Unit): Xliff1TransUnit | undefined {
  const v2Elements = v2Unit.elements || [];
  const v2Notes = v2Elements.filter((e) => e.name === 'notes') as Notes[];
  const v2Segments = v2Elements.filter(
    (e) => e.name === 'segment',
  ) as Segment[];
  const v2Segment = v2Segments[0];
  if (!v2Segment) {
    logger.warn(`No segment in ${v2Unit.attributes.id}`);
    return undefined;
  }
  const v2Sources = v2Segment.elements.filter(
    (e) => e.name === 'source',
  ) as Source[];
  const v2Source = v2Sources[0];
  if (!v2Source) {
    logger.warn(`No source in ${v2Unit.attributes.id}`);
    return undefined;
  }
  const v2Targets = v2Segment.elements.filter(
    (e) => e.name === 'target',
  ) as Target[];
  const v2Target = v2Targets.length > 0 ? v2Targets[0] : undefined;
  const v1Notes = v2Notes
    .flatMap((notes) => {
      return notes.elements.map((note) => {
        return {
          name: 'note',
          type: 'element',
          elements: [
            {
              type: 'text',
              text: elementAsText(note),
            },
          ],
        };
      });
    })
    .filter((e) => e !== undefined) as Xliff1Note[];
  const v1Source: Xliff1Source = {
    name: 'source',
    type: 'element',
    attributes: {},
    elements: [
      {
        type: 'text',
        text: elementAsText(v2Source),
      },
    ],
  };
  const v1Target: Xliff1Target | undefined = v2Target
    ? {
        name: 'target',
        type: 'element',
        attributes: {},
        elements: [
          {
            type: 'text',
            text: elementAsText(v2Target),
          },
        ],
      }
    : undefined;
  let unitElements: (Xliff1Source | Xliff1Target | Xliff1Note)[] = [];
  if (v1Notes.length > 0) {
    unitElements = unitElements.concat(v1Notes);
  }
  unitElements.push(v1Source);
  if (v1Target) {
    unitElements.push(v1Target);
  }
  const v1Unit: Xliff1TransUnit = {
    name: 'trans-unit',
    type: 'element',
    attributes: {
      id: v2Unit.attributes.id,
    },
    elements: unitElements,
  };
  return v1Unit;
}
