/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { DEFAULT_PAGE_VIEW } from '../types/project.ts';
import type { DocumentData, ProjectManifest } from '../types/project.ts';
import { countWords } from './text.ts';

export interface ProjectTemplateOption {
  id: string;
  name: string;
  description: string;
  iconName: string;
  wordCountEstimate: number;
}

export const TEMPLATE_OPTIONS: ProjectTemplateOption[] = [
  {
    id: 'novel_fantasy',
    name: 'Fantasy Novel (Pre-populated Manuscript)',
    description: 'Includes multi-chapter manuscript structure, character cards, world Bible notes, and sample text.',
    iconName: 'BookOpen',
    wordCountEstimate: 4500,
  },
  {
    id: 'screenplay_noir',
    name: 'Screenplay / Script',
    description: 'Formatted scene outline, act structures, character breakdowns, and shooting notes.',
    iconName: 'Film',
    wordCountEstimate: 2800,
  },
  {
    id: 'blank_novel',
    name: 'Standard Blank Project',
    description: 'Clean project with basic Manuscript folder, Characters, Places, and Trash container.',
    iconName: 'FilePlus',
    wordCountEstimate: 0,
  },
];

type DocumentSeed = Omit<DocumentData, 'wordCount' | 'charCount'>;

/** Builds a document and derives its counters from the actual text. */
function createDocument(seed: DocumentSeed): DocumentData {
  return {
    ...seed,
    wordCount: countWords(seed.plainText),
    charCount: seed.plainText.length,
  };
}

export function createProjectFromTemplate(
  templateId: string,
  title: string,
  author: string,
  targetWordCount: number
): { manifest: ProjectManifest; documents: Record<string, DocumentData> } {
  const projectId = `proj_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const now = new Date().toISOString();

  const manifest: ProjectManifest = {
    id: projectId,
    title: title || 'Untitled Project',
    author: author || 'Anonymous Author',
    version: '1.0.0',
    createdAt: now,
    updatedAt: now,
    settings: {
      targetWordCount: targetWordCount || 75000,
      pageView: { ...DEFAULT_PAGE_VIEW, margins: { ...DEFAULT_PAGE_VIEW.margins } },
    },
    tree: [],
  };

  const documents: Record<string, DocumentData> = {};

  if (templateId === 'novel_fantasy') {
    manifest.tree = [
      {
        id: 'folder_manuscript',
        parentId: null,
        type: 'folder',
        title: 'Manuscript',
        expanded: true,
        sortOrder: 0,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'doc_chap1',
        parentId: 'folder_manuscript',
        type: 'document',
        title: 'Chapter 1: The Lantern at Sunset',
        sortOrder: 0,
        synopsis: 'Evelyn arrives at the coastal watchtower and discovers the abandoned compass.',
        status: 'first_draft',
        colorLabel: 'slate-blue',
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'doc_chap2',
        parentId: 'folder_manuscript',
        type: 'document',
        title: 'Chapter 2: Whispers from the Reef',
        sortOrder: 1,
        synopsis: 'Old mariner Zadok shares the forbidden tales of the Deep Ones.',
        status: 'in_progress',
        colorLabel: 'sage',
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'doc_chap3',
        parentId: 'folder_manuscript',
        type: 'document',
        title: 'Chapter 3: The Tide Rises',
        sortOrder: 2,
        synopsis: 'The storm breaks over the harbor as the first beacon fails.',
        status: 'to_do',
        colorLabel: 'ochre',
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'folder_characters',
        parentId: null,
        type: 'folder',
        title: 'Characters & Cast',
        expanded: true,
        sortOrder: 1,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'char_evelyn',
        parentId: 'folder_characters',
        type: 'character_card',
        title: 'Evelyn Vane',
        sortOrder: 0,
        synopsis: 'Protagonist. Cartographer sent by the Royal Academy to survey the eastern coastline.',
        status: 'revised',
        customAttributes: {
          Age: '28',
          Role: 'Protagonist / Cartographer',
          Goal: 'Map the uncharted outer shoals before winter sets in',
        },
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'char_zadok',
        parentId: 'folder_characters',
        type: 'character_card',
        title: 'Zadok Allen',
        sortOrder: 1,
        synopsis: 'Local harbor keeper who has lived through three coastal sieges.',
        status: 'in_progress',
        customAttributes: {
          Age: '74',
          Role: 'Mentor / Informant',
          Goal: 'Protect the ancient lighthouse archives from falling into ruin',
        },
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'folder_research',
        parentId: null,
        type: 'folder',
        title: 'World Bible & Research',
        expanded: false,
        sortOrder: 2,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'note_geography',
        parentId: 'folder_research',
        type: 'note',
        title: 'Coastal Tides & Nautical Routes',
        sortOrder: 0,
        synopsis: 'Notes on spring tides, granite reefs, and historical shipping lanes.',
        createdAt: now,
        updatedAt: now,
      },
    ];

    documents['doc_chap1'] = createDocument({
      id: 'doc_chap1',
      projectId,
      title: 'Chapter 1: The Lantern at Sunset',
      updatedAt: now,
      plainText: `The salt-crusted gale blew hard against the glass of the northern watchtower. Below the cliff, black breakers churned against granite spurs like iron hammers hitting an anvil. Evelyn adjusted her brass telescope, squinting through the sea haze toward the silhouette of the outer shoals.\n\n"You'll find no quiet waters in November, Miss Vane," old Zadok murmured, his breath smelling of pipe smoke and dried clover. "The reef takes what it pleases, and it hasn't given back a timber since the Great Gale of '94."\n\nEvelyn did not lower the telescope. Through the spray, she saw the faint rhythmic pulse of an iron lantern—bright, yellow, and entirely unmapped on the Admiralty charts she had carried from the capital.\n\n"That light isn't coming from a buoy, Zadok," she said softly, tracing the ink contour on her parchment table. "It's anchored on solid ground."\n\nThe old man paused, his worn leather mittens tightening around his walking stick. "There is no solid ground three miles off the point. Only the submerged ruins of the old drowned chapel."`,
      content: {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [
              {
                type: 'text',
                text: 'The salt-crusted gale blew hard against the glass of the northern watchtower. Below the cliff, black breakers churned against granite spurs like iron hammers hitting an anvil. Evelyn adjusted her brass telescope, squinting through the sea haze toward the silhouette of the outer shoals.',
              },
            ],
          },
          {
            type: 'paragraph',
            content: [
              {
                type: 'text',
                text: '"You\'ll find no quiet waters in November, Miss Vane," old Zadok murmured, his breath smelling of pipe smoke and dried clover. "The reef takes what it pleases, and it hasn\'t given back a timber since the Great Gale of \'94."',
              },
            ],
          },
          {
            type: 'paragraph',
            content: [
              {
                type: 'text',
                text: 'Evelyn did not lower the telescope. Through the spray, she saw the faint rhythmic pulse of an iron lantern—bright, yellow, and entirely unmapped on the Admiralty charts she had carried from the capital.',
              },
            ],
          },
          {
            type: 'paragraph',
            content: [
              {
                type: 'text',
                text: '"That light isn\'t coming from a buoy, Zadok," she said softly, tracing the ink contour on her parchment table. "It\'s anchored on solid ground."',
              },
            ],
          },
          {
            type: 'paragraph',
            content: [
              {
                type: 'text',
                text: 'The old man paused, his worn leather mittens tightening around his walking stick. "There is no solid ground three miles off the point. Only the submerged ruins of the old drowned chapel."',
              },
            ],
          },
        ],
      },
      notes: 'Check nautical vocabulary for watchtower instruments. Ensure tension builds around the drowned chapel reef.',
      bookmarks: [{ id: 'bm_1', title: 'First sight of the unmapped light', position: 350, createdAt: now }],
      comments: [
        { id: 'c1', author: 'Editor', text: 'Great atmospheric opening! The dialogue pacing works nicely.', createdAt: now, resolved: false },
      ],
    });

    documents['doc_chap2'] = createDocument({
      id: 'doc_chap2',
      projectId,
      title: 'Chapter 2: Whispers from the Reef',
      updatedAt: now,
      plainText: `The harbor inn smelled of tallow and brine. In the corner near the hearth, three crewmen from the coal schooner were arguing over a grease-stained map.\n\nEvelyn sat by the window, her inkpot wedged between two heavy sea logs. Every sound outside—the creak of rigging, the distant clang of the fogbell—seemed to reverberate with the cadence of the mysterious light.\n\n"You're asking about the Drowned Chapel, lass," a dark-eyed sailor said, stepping into the lamplight. "No boat that crossed the shoal after twilight ever returned with its rudder intact."`,
      content: {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [
              {
                type: 'text',
                text: 'The harbor inn smelled of tallow and brine. In the corner near the hearth, three crewmen from the coal schooner were arguing over a grease-stained map.',
              },
            ],
          },
          {
            type: 'paragraph',
            content: [
              {
                type: 'text',
                text: 'Evelyn sat by the window, her inkpot wedged between two heavy sea logs. Every sound outside—the creak of rigging, the distant clang of the fogbell—seemed to reverberate with the cadence of the mysterious light.',
              },
            ],
          },
          {
            type: 'paragraph',
            content: [
              {
                type: 'text',
                text: '"You\'re asking about the Drowned Chapel, lass," a dark-eyed sailor said, stepping into the lamplight. "No boat that crossed the shoal after twilight ever returned with its rudder intact."',
              },
            ],
          },
        ],
      },
      notes: 'Introduce the mysterious sailor and establish the tavern atmosphere.',
      bookmarks: [],
      comments: [],
    });

    documents['doc_chap3'] = createDocument({
      id: 'doc_chap3',
      projectId,
      title: 'Chapter 3: The Tide Rises',
      updatedAt: now,
      plainText: `The midnight tide arrived ahead of schedule, swallowing the granite causeway link by link...`,
      content: {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [
              {
                type: 'text',
                text: 'The midnight tide arrived ahead of schedule, swallowing the granite causeway link by link...',
              },
            ],
          },
        ],
      },
      notes: 'Climax of the first act. Evelyn decides to hire a boat at midnight.',
      bookmarks: [],
      comments: [],
    });

    documents['char_evelyn'] = createDocument({
      id: 'char_evelyn',
      projectId,
      title: 'Evelyn Vane',
      updatedAt: now,
      plainText: `Evelyn Vane is an ambitious 28-year-old cartographer. She carries a brass octant passed down from her grandfather and possesses an exceptional memory for coastal topographies.`,
      content: {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [
              {
                type: 'text',
                text: 'Evelyn Vane is an ambitious 28-year-old cartographer. She carries a brass octant passed down from her grandfather and possesses an exceptional memory for coastal topographies.',
              },
            ],
          },
        ],
      },
      notes: 'Character motivations and backstory notes.',
      bookmarks: [],
      comments: [],
    });

    documents['char_zadok'] = createDocument({
      id: 'char_zadok',
      projectId,
      title: 'Zadok Allen',
      updatedAt: now,
      plainText: `Zadok Allen has lived in North Point for 74 years. Stern, weather-beaten, but deeply protective of local history.`,
      content: {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [
              {
                type: 'text',
                text: 'Zadok Allen has lived in North Point for 74 years. Stern, weather-beaten, but deeply protective of local history.',
              },
            ],
          },
        ],
      },
      notes: '',
      bookmarks: [],
      comments: [],
    });

    documents['note_geography'] = createDocument({
      id: 'note_geography',
      projectId,
      title: 'Coastal Tides & Nautical Routes',
      updatedAt: now,
      plainText: `High tide occurs at 04:15 AM and 04:30 PM. The granite reef becomes passable only during lunar low tides. Key locations: Drowned Chapel Reef, Iron Beacon, Lantern Rock.`,
      content: {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [
              {
                type: 'text',
                text: 'High tide occurs at 04:15 AM and 04:30 PM. The granite reef becomes passable only during lunar low tides. Key locations: Drowned Chapel Reef, Iron Beacon, Lantern Rock.',
              },
            ],
          },
        ],
      },
      notes: '',
      bookmarks: [],
      comments: [],
    });
  } else if (templateId === 'screenplay_noir') {
    manifest.tree = [
      {
        id: 'folder_script',
        parentId: null,
        type: 'folder',
        title: 'Screenplay (Acts)',
        expanded: true,
        sortOrder: 0,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'doc_act1',
        parentId: 'folder_script',
        type: 'document',
        title: 'Act I: Scene 1 - Neon Rain',
        sortOrder: 0,
        synopsis: 'EXT. METROPOLIS ALLEY - NIGHT. Rain slicked asphalt reflects flickering holographic advertisements.',
        status: 'first_draft',
        createdAt: now,
        updatedAt: now,
      },
    ];

    documents['doc_act1'] = createDocument({
      id: 'doc_act1',
      projectId,
      title: 'Act I: Scene 1 - Neon Rain',
      updatedAt: now,
      plainText: `EXT. METROPOLIS ALLEY - NIGHT\n\nRain pours down like liquid mercury across the rusted fire escapes. DETECTIVE MILLER (40s), trench coat buttoned to the neck, lights a synthetic cigarette.\n\nMILLER\n(into radio)\nControl, I'm at the dock grid. Signal's clear, but there's no sign of the transport vessel.`,
      content: {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            attrs: { textAlign: 'left' },
            content: [{ type: 'text', text: 'EXT. METROPOLIS ALLEY - NIGHT' }],
          },
          {
            type: 'paragraph',
            attrs: { textAlign: 'left' },
            content: [
              {
                type: 'text',
                text: 'Rain pours down like liquid mercury across the rusted fire escapes. DETECTIVE MILLER (40s), trench coat buttoned to the neck, lights a synthetic cigarette.',
              },
            ],
          },
          {
            type: 'paragraph',
            attrs: { textAlign: 'center' },
            content: [{ type: 'text', text: 'MILLER' }],
          },
          {
            type: 'paragraph',
            attrs: { textAlign: 'center' },
            content: [{ type: 'text', text: '(into radio)' }],
          },
          {
            type: 'paragraph',
            attrs: { textAlign: 'left' },
            content: [
              {
                type: 'text',
                text: "Control, I'm at the dock grid. Signal's clear, but there's no sign of the transport vessel.",
              },
            ],
          },
        ],
      },
      notes: 'Screenplay scene styling.',
      bookmarks: [],
      comments: [],
    });
  } else {
    // Blank Project
    manifest.tree = [
      {
        id: 'folder_manuscript',
        parentId: null,
        type: 'folder',
        title: 'Manuscript',
        expanded: true,
        sortOrder: 0,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'doc_chap1',
        parentId: 'folder_manuscript',
        type: 'document',
        title: 'Chapter 1',
        sortOrder: 0,
        synopsis: 'First document of your story.',
        status: 'draft',
        createdAt: now,
        updatedAt: now,
      },
    ];

    documents['doc_chap1'] = createDocument({
      id: 'doc_chap1',
      projectId,
      title: 'Chapter 1',
      updatedAt: now,
      plainText: '',
      content: {
        type: 'doc',
        content: [{ type: 'paragraph' }],
      },
      notes: '',
      bookmarks: [],
      comments: [],
    });
  }

  const documentIdMap = new Map(
    Object.keys(documents).map((documentId) => [documentId, `doc_${projectId}_${documentId}`])
  );
  const projectDocuments: Record<string, DocumentData> = {};
  for (const [documentId, document] of Object.entries(documents)) {
    const uniqueDocumentId = documentIdMap.get(documentId)!;
    projectDocuments[uniqueDocumentId] = {
      ...document,
      id: uniqueDocumentId,
    };
  }
  manifest.tree = manifest.tree.map((node) => {
    const uniqueDocumentId = documentIdMap.get(node.id);
    return uniqueDocumentId ? { ...node, id: uniqueDocumentId } : node;
  });

  // Keep the binder tree in sync with the freshly generated documents so the
  // status bar and the recent-projects list show real numbers from the start.
  manifest.tree = manifest.tree.map((node) => {
    const document = projectDocuments[node.id];
    return document ? { ...node, wordCount: document.wordCount } : node;
  });

  return { manifest, documents: projectDocuments };
}
