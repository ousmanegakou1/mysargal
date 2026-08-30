// ============================================================
// MySargal Caisse - Export / import CSV
// Export : ecrit un fichier dans le dossier de l'app puis ouvre le partage
// systeme (equivalent natif du telechargement web). Import : parseur CSV
// robuste (virgule ou point virgule, guillemets) pour l'import VIP.
// ============================================================

import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as DocumentPicker from 'expo-document-picker';

// Echappe une valeur CSV (RFC 4180).
function esc(v: unknown): string {
  const s = String(v ?? '');
  if (/[",;\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}

// Construit le contenu CSV a partir d'en-tetes + lignes.
export function buildCSV(headers: string[], rows: (string | number | null | undefined)[][]): string {
  const head = headers.map(esc).join(',');
  const body = rows.map((r) => r.map(esc).join(',')).join('\r\n');
  return '﻿' + head + '\r\n' + body; // BOM UTF-8
}

// Ecrit puis partage un fichier CSV. Renvoie le chemin du fichier.
export async function exportCSV(filename: string, content: string): Promise<string> {
  const uri = FileSystem.documentDirectory + filename;
  await FileSystem.writeAsStringAsync(uri, content, { encoding: FileSystem.EncodingType.UTF8 });
  const canShare = await Sharing.isAvailableAsync();
  if (canShare) {
    await Sharing.shareAsync(uri, { mimeType: 'text/csv', dialogTitle: filename, UTI: 'public.comma-separated-values-text' });
  }
  return uri;
}

// --- Import ---

// Normalise un en-tete (sans accents, minuscule, alphanum).
export function normHeader(s: string): string {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

// Ouvre le selecteur de fichiers et renvoie le contenu texte du CSV/Excel
// choisi (null si annule). Pour Excel on ne lit que le texte brut : on
// recommande un export CSV/UTF-8.
export async function pickCSVText(): Promise<string | null> {
  const res = await DocumentPicker.getDocumentAsync({
    type: ['text/csv', 'text/comma-separated-values', 'application/vnd.ms-excel', 'text/plain', '*/*'],
    copyToCacheDirectory: true,
    multiple: false,
  });
  if (res.canceled || !res.assets || !res.assets.length) return null;
  const uri = res.assets[0].uri;
  const content = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.UTF8 });
  return content;
}

// Parse un CSV brut en tableau de tableaux (gere , ou ; et guillemets).
export function parseCSV(text: string): string[][] {
  const clean = String(text || '').replace(/^﻿/, '');
  // Detection du separateur sur la premiere ligne.
  const firstLine = clean.split(/\r?\n/)[0] || '';
  const sep = (firstLine.match(/;/g) || []).length > (firstLine.match(/,/g) || []).length ? ';' : ',';
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i];
    if (inQuotes) {
      if (ch === '"') {
        if (clean[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === sep) {
      row.push(field);
      field = '';
    } else if (ch === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else if (ch === '\r') {
      // ignore
    } else {
      field += ch;
    }
  }
  if (field.length || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c && c.trim()));
}
