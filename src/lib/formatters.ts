import type { Timestamp } from 'firebase/firestore';
import type { QuestionDifficulty, QuestionType } from '../types';

export function formatDate(
  input: Timestamp | Date | string | number | null | undefined,
  locale: 'en' | 'bn' = 'en'
): string {
  if (!input) return '—';
  let date: Date;
  if (typeof input === 'string' || typeof input === 'number') {
    date = new Date(input);
  } else if (input instanceof Date) {
    date = input;
  } else if (typeof (input as Timestamp).toDate === 'function') {
    date = (input as Timestamp).toDate();
  } else {
    return '—';
  }
  if (Number.isNaN(date.getTime())) return '—';

  return date.toLocaleDateString(locale === 'bn' ? 'bn-BD' : 'en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export function getTodayISO(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function getMonthISO(date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

export function sanitizePhoneForWhatsApp(phone: string): string {
  const digits = phone.replace(/[^\d+]/g, '');
  if (!digits) return '';
  if (digits.startsWith('+')) return digits.slice(1);
  // Default BD country code normalization if local 01XXXXXXXXX number
  if (digits.startsWith('01') && digits.length === 11) {
    return `88${digits}`;
  }
  return digits;
}

export function buildWhatsAppUrl(phone: string, message: string): string {
  const cleaned = sanitizePhoneForWhatsApp(phone);
  const encoded = encodeURIComponent(message);
  return cleaned ? `https://wa.me/${cleaned}?text=${encoded}` : `https://wa.me/?text=${encoded}`;
}

export function fillMessagePlaceholders(
  template: string,
  values: Record<string, string | number>
): string {
  let result = template;
  Object.entries(values).forEach(([key, val]) => {
    const regex = new RegExp(`\\{${key}\\}`, 'gi');
    result = result.replace(regex, String(val));
  });
  return result;
}

export interface ParsedBulkQuestion {
  type: QuestionType;
  text: string;
  subject: string;
  chapter: string;
  difficulty: QuestionDifficulty;
  tags: string[];
  imageUrl?: string;
  options?: string[];
  pairs?: { left: string; right: string }[];
  items?: string[];
  correctAnswer: unknown;
  explanation: string;
}

export interface BulkImportResult {
  valid: ParsedBulkQuestion[];
  errors: { row: number; message: string }[];
}

const VALID_TYPES: QuestionType[] = ['mcq', 'truefalse', 'matching', 'fillblank', 'ordering'];
const VALID_DIFF: QuestionDifficulty[] = ['easy', 'medium', 'hard'];

export function parseCsvLine(line: string): string[] {
  const cells: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      cells.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  cells.push(current.trim());
  return cells;
}

export function parseBulkQuestions(raw: string, format: 'json' | 'csv'): BulkImportResult {
  const valid: ParsedBulkQuestion[] = [];
  const errors: { row: number; message: string }[] = [];

  if (format === 'json') {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return { valid: [], errors: [{ row: 0, message: 'Invalid JSON syntax.' }] };
    }
    if (!Array.isArray(parsed)) {
      return { valid: [], errors: [{ row: 0, message: 'JSON root must be an array of question objects.' }] };
    }
    parsed.forEach((item, idx) => {
      const rowNum = idx + 1;
      if (!item || typeof item !== 'object') {
        errors.push({ row: rowNum, message: 'Row is not an object.' });
        return;
      }
      const obj = item as Record<string, unknown>;
      const type = String(obj.type || '').toLowerCase() as QuestionType;
      const text = String(obj.text || '').trim();
      const subject = String(obj.subject || '').trim();
      const chapter = String(obj.chapter || 'General').trim();
      const difficulty = (String(obj.difficulty || 'medium').toLowerCase()) as QuestionDifficulty;

      if (!VALID_TYPES.includes(type)) {
        errors.push({ row: rowNum, message: `Invalid type "${obj.type}". Expected: ${VALID_TYPES.join(', ')}` });
        return;
      }
      if (!text) {
        errors.push({ row: rowNum, message: 'Question text is required.' });
        return;
      }
      if (!subject) {
        errors.push({ row: rowNum, message: 'Subject is required.' });
        return;
      }
      if (!VALID_DIFF.includes(difficulty)) {
        errors.push({ row: rowNum, message: `Invalid difficulty "${obj.difficulty}".` });
        return;
      }
      if (obj.correctAnswer === undefined || obj.correctAnswer === null || obj.correctAnswer === '') {
        errors.push({ row: rowNum, message: 'correctAnswer is required.' });
        return;
      }
      if (type === 'mcq' && (!Array.isArray(obj.options) || obj.options.length < 2)) {
        errors.push({ row: rowNum, message: 'MCQ requires at least 2 options.' });
        return;
      }
      if (type === 'matching' && (!Array.isArray(obj.pairs) || obj.pairs.length < 2)) {
        errors.push({ row: rowNum, message: 'Matching requires pairs array.' });
        return;
      }
      if (type === 'ordering' && (!Array.isArray(obj.items) || obj.items.length < 2)) {
        errors.push({ row: rowNum, message: 'Ordering requires items array.' });
        return;
      }

      valid.push({
        type,
        text,
        subject,
        chapter,
        difficulty,
        tags: Array.isArray(obj.tags) ? obj.tags.map(String) : [],
        imageUrl: obj.imageUrl ? String(obj.imageUrl) : undefined,
        options: Array.isArray(obj.options) ? obj.options.map(String) : undefined,
        pairs: Array.isArray(obj.pairs) ? (obj.pairs as { left: string; right: string }[]) : undefined,
        items: Array.isArray(obj.items) ? obj.items.map(String) : undefined,
        correctAnswer: obj.correctAnswer,
        explanation: String(obj.explanation || ''),
      });
    });
    return { valid, errors };
  }

  // CSV format: type,subject,chapter,difficulty,text,options_or_items,correctAnswer,explanation,tags,imageUrl
  // Options/items separated by '|', matching pairs as 'left:right|left2:right2'
  const lines = raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  if (lines.length < 2) {
    return { valid: [], errors: [{ row: 0, message: 'CSV requires a header row and at least one data row.' }] };
  }

  const headers = parseCsvLine(lines[0]).map((h) => h.toLowerCase());
  const idx = (name: string) => headers.indexOf(name.toLowerCase());

  if (idx('type') === -1 || idx('text') === -1 || idx('subject') === -1 || idx('correctanswer') === -1) {
    return {
      valid: [],
      errors: [{ row: 1, message: 'Missing required CSV columns: type, subject, text, correctAnswer.' }],
    };
  }

  for (let i = 1; i < lines.length; i++) {
    const rowNum = i + 1;
    const cols = parseCsvLine(lines[i]);
    const get = (name: string) => {
      const colIndex = idx(name);
      return colIndex >= 0 && colIndex < cols.length ? cols[colIndex] : '';
    };

    const type = get('type').toLowerCase() as QuestionType;
    const text = get('text');
    const subject = get('subject');
    const chapter = get('chapter') || 'General';
    const difficulty = (get('difficulty') || 'medium').toLowerCase() as QuestionDifficulty;
    const rawOptions = get('options');
    const rawCorrect = get('correctAnswer');
    const explanation = get('explanation');
    const tags = get('tags')
      ? get('tags').split('|').map((t) => t.trim()).filter(Boolean)
      : [];
    const imageUrl = get('imageUrl') || undefined;

    if (!VALID_TYPES.includes(type)) {
      errors.push({ row: rowNum, message: `Invalid type "${type}".` });
      continue;
    }
    if (!text || !subject || !rawCorrect) {
      errors.push({ row: rowNum, message: 'text, subject, and correctAnswer are required.' });
      continue;
    }
    if (!VALID_DIFF.includes(difficulty)) {
      errors.push({ row: rowNum, message: `Invalid difficulty "${difficulty}".` });
      continue;
    }

    if (type === 'mcq') {
      const options = rawOptions.split('|').map((o) => o.trim()).filter(Boolean);
      if (options.length < 2) {
        errors.push({ row: rowNum, message: 'MCQ needs pipe-separated options (e.g. A|B|C|D).' });
        continue;
      }
      valid.push({ type, text, subject, chapter, difficulty, tags, imageUrl, options, correctAnswer: rawCorrect, explanation });
    } else if (type === 'truefalse') {
      valid.push({ type, text, subject, chapter, difficulty, tags, imageUrl, options: ['True', 'False'], correctAnswer: rawCorrect, explanation });
    } else if (type === 'fillblank') {
      valid.push({ type, text, subject, chapter, difficulty, tags, imageUrl, correctAnswer: rawCorrect, explanation });
    } else if (type === 'ordering') {
      const items = rawOptions.split('|').map((o) => o.trim()).filter(Boolean);
      const correctOrder = rawCorrect.split('|').map((o) => o.trim()).filter(Boolean);
      if (items.length < 2 || correctOrder.length !== items.length) {
        errors.push({ row: rowNum, message: 'Ordering requires matching pipe-separated items and correctAnswer order.' });
        continue;
      }
      valid.push({ type, text, subject, chapter, difficulty, tags, imageUrl, items, correctAnswer: correctOrder, explanation });
    } else if (type === 'matching') {
      const pairs = rawOptions
        .split('|')
        .map((pair) => {
          const [left, right] = pair.split(':').map((s) => s.trim());
          return { left: left || '', right: right || '' };
        })
        .filter((p) => p.left && p.right);
      if (pairs.length < 2) {
        errors.push({ row: rowNum, message: 'Matching requires pairs in left:right|left2:right2 format.' });
        continue;
      }
      const correctMap: Record<string, string> = {};
      pairs.forEach((p) => {
        correctMap[p.left] = p.right;
      });
      valid.push({ type, text, subject, chapter, difficulty, tags, imageUrl, pairs, correctAnswer: correctMap, explanation });
    }
  }

  return { valid, errors };
}

export const SAMPLE_CSV_TEMPLATE = `type,subject,chapter,difficulty,text,options,correctAnswer,explanation,tags,imageUrl
mcq,Mathematics,Algebra,easy,"Solve for $x$: $2x + 6 = 14$","2|4|6|8",4,"Subtract 6 then divide by 2: $x = 4$.","algebra|linear",
truefalse,Physics,Motion,easy,"Acceleration due to gravity near Earth's surface is approximately $9.8\\text{ m/s}^2$.","True|False",True,"Standard gravitational acceleration $g \\approx 9.81\\text{ m/s}^2$.","mechanics",
fillblank,Chemistry,Periodic Table,medium,"The chemical symbol for Gold is ____.",,"Au","Derived from Latin Aurum.","elements",
ordering,Biology,Cell Cycle,medium,"Order the phases of Mitosis","Metaphase|Prophase|Telophase|Anaphase","Prophase|Metaphase|Anaphase|Telophase","PMAT sequence.","mitosis",
matching,Physics,SI Units,easy,"Match physical quantities with SI units","Force:Newton|Energy:Joule|Power:Watt","Force:Newton|Energy:Joule|Power:Watt","Standard SI derived units.","units",`;

export const SAMPLE_JSON_TEMPLATE = JSON.stringify(
  [
    {
      type: 'mcq',
      subject: 'Mathematics',
      chapter: 'Quadratic Equations',
      difficulty: 'medium',
      text: 'Find the discriminant of $x^2 - 5x + 6 = 0$.',
      options: ['1', '5', '25', '-1'],
      correctAnswer: '1',
      explanation: '$\\Delta = b^2 - 4ac = (-5)^2 - 4(1)(6) = 25 - 24 = 1$.',
      tags: ['quadratic', 'algebra'],
    },
    {
      type: 'truefalse',
      subject: 'Physics',
      chapter: 'Optics',
      difficulty: 'easy',
      text: 'Light travels faster in glass than in a vacuum.',
      options: ['True', 'False'],
      correctAnswer: 'False',
      explanation: 'Speed of light is maximum in vacuum ($c \\approx 3 \\times 10^8\\text{ m/s}$).',
      tags: ['optics'],
    },
  ],
  null,
  2
);
