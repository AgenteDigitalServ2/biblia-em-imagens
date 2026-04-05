export interface BiblePassage {
  book: string;
  chapter: number;
  verse: number;
  text?: string;
}

export interface GeneratedImage {
  id: string;
  timestamp: number;
  passage: BiblePassage;
  prompt: string;
  imageUrl: string;
  isFavorite: boolean;
  metadata: {
    hashtags: string[];
    shortCitation: string;
  };
}

export interface BibleBook {
  name: string;
  chapters: number;
}
