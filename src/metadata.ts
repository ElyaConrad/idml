/**
 * Parsing of the document XMP metadata packet (`META-INF/metadata.xml`).
 *
 * InDesign records, for every font the document uses, an `xmpTPg:Fonts` bag of
 * `stFnt:*` descriptors — crucially including the ORIGINAL font file name on the
 * author's disk (`stFnt:fontFileName`). That file name is the reliable link
 * between a required font and the binary shipped in a package's `Document
 * fonts/` folder, since the folder file name (e.g. `DINBd_.ttf`) rarely matches
 * the family name (`DIN-Bold`). Example entry:
 *
 * ```xml
 * <rdf:li rdf:parseType="Resource">
 *   <stFnt:fontName>DIN-Bold</stFnt:fontName>
 *   <stFnt:fontFamily>DIN-Bold</stFnt:fontFamily>
 *   <stFnt:fontFace>Regular</stFnt:fontFace>
 *   <stFnt:fontType>TrueType</stFnt:fontType>
 *   <stFnt:composite>false</stFnt:composite>
 *   <stFnt:fontFileName>DINBd_.ttf</stFnt:fontFileName>
 * </rdf:li>
 * ```
 *
 * `stFnt:fontName` is the PostScript name and joins to `Resources/Fonts.xml`'s
 * `Font/@PostScriptName`; `stFnt:fontFamily` + `stFnt:fontFace` join to
 * `FontFamily/@Name` + `Font/@FontStyleName`. Both joins are exposed via
 * `IDML.resolveFontFile()`.
 */

/** One `stFnt:*` font descriptor from the document's XMP font bag. */
export type DocumentFontResource = {
  /** PostScript name — the primary join key (`Font/@PostScriptName`). */
  fontName: string;
  /** Family name, e.g. "Minion Pro". */
  fontFamily?: string;
  /** Face / style within the family, e.g. "Bold Cond Italic". */
  fontFace?: string;
  /** e.g. "TrueType", "OpenTypeCFF". */
  fontType?: string;
  versionString?: string;
  composite?: boolean;
  /** Original on-disk file name, e.g. "DINBd_.ttf" — match against packaged fonts. */
  fontFileName?: string;
};

/** Case/spacing/punctuation-insensitive key for fuzzy font name comparison. */
export function normalizeFontKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/** Minimal structural type so this works with any DOM-ish parsed root. */
type ElementLike = { getElementsByTagName(tagName: string): ArrayLike<ElementLike>; textContent: string | null };

/**
 * Extract every `stFnt:*` font descriptor from a parsed XMP metadata root.
 * Scoped to `xmpTPg:Fonts` bags so unrelated `rdf:li` items (swatches, plate
 * names, …) are ignored. Returns `[]` when the packet carries no font bag.
 */
export function parseDocumentFonts(root: ElementLike): DocumentFontResource[] {
  const result: DocumentFontResource[] = [];
  const seen = new Set<string>();

  const bags = Array.from(root.getElementsByTagName('xmpTPg:Fonts'));
  for (const bag of bags) {
    for (const li of Array.from(bag.getElementsByTagName('rdf:li'))) {
      const read = (tag: string) => {
        const el = li.getElementsByTagName(tag)[0];
        const text = el?.textContent?.trim();
        return text ? text : undefined;
      };
      const fontName = read('stFnt:fontName');
      if (!fontName) continue;

      const entry: DocumentFontResource = {
        fontName,
        fontFamily: read('stFnt:fontFamily'),
        fontFace: read('stFnt:fontFace'),
        fontType: read('stFnt:fontType'),
        versionString: read('stFnt:versionString'),
        composite: read('stFnt:composite') === 'true',
        fontFileName: read('stFnt:fontFileName'),
      };

      const dedupeKey = `${entry.fontName}|${entry.fontFileName ?? ''}`;
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);
      result.push(entry);
    }
  }
  return result;
}
