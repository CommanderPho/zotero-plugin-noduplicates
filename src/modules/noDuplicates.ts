const DOI_PREFIX_REGEX = /^https?:\/\/(?:dx\.)?doi\.org\//i;
const WHITESPACE_REGEX = /\s+/g;
const NON_ISBN_CHAR_REGEX = /[^0-9X]/gi;
const YEAR_REGEX = /(\d{4})/;

type DuplicateComparableItem = Pick<
  Zotero.Item,
  | "id"
  | "libraryID"
  | "firstCreator"
  | "isFeedItem"
  | "isRegularItem"
  | "getField"
>;

interface DuplicateSignature {
  kind: "doi" | "isbn" | "titleCreatorYear";
  value: string;
}

function normalizeText(value: string): string {
  return value.trim().toLowerCase().replace(WHITESPACE_REGEX, " ");
}

export function normalizeDOI(value: string): string {
  const normalized = normalizeText(value);
  return normalized.replace(DOI_PREFIX_REGEX, "");
}

export function normalizeISBN(value: string): string {
  return value.toUpperCase().replace(NON_ISBN_CHAR_REGEX, "");
}

export function extractYear(value: string): string {
  return value.match(YEAR_REGEX)?.[1] || "";
}

export function getDuplicateSignature(
  item: DuplicateComparableItem,
): DuplicateSignature | null {
  if (!item.isRegularItem() || item.isFeedItem) {
    return null;
  }

  const doi = normalizeDOI(item.getField("DOI"));
  if (doi) {
    return { kind: "doi", value: doi };
  }

  const isbn = normalizeISBN(item.getField("ISBN"));
  if (isbn.length === 10 || isbn.length === 13) {
    return { kind: "isbn", value: isbn };
  }

  const title = normalizeText(item.getField("title"));
  if (!title) {
    return null;
  }

  const creator = normalizeText(item.firstCreator || "");
  const year = extractYear(item.getField("date", true, true));
  if (!creator && !year) {
    return null;
  }

  return {
    kind: "titleCreatorYear",
    value: `${title}|${creator}|${year}`,
  };
}

export function areItemsDuplicates(
  first: DuplicateComparableItem,
  second: DuplicateComparableItem,
): boolean {
  const firstSignature = getDuplicateSignature(first);
  if (!firstSignature) {
    return false;
  }
  const secondSignature = getDuplicateSignature(second);
  return (
    !!secondSignature &&
    firstSignature.kind === secondSignature.kind &&
    firstSignature.value === secondSignature.value
  );
}

export async function blockDuplicateItem(
  item: Zotero.Item,
): Promise<Zotero.Item | null> {
  const itemSignature = getDuplicateSignature(item);
  if (!itemSignature) {
    return null;
  }

  const allLibraryItems = await Zotero.Items.getAll(item.libraryID);
  const duplicate = allLibraryItems.find((candidate) => {
    return candidate.id !== item.id && areItemsDuplicates(item, candidate);
  });

  if (!duplicate) {
    return null;
  }

  await Zotero.Items.trashTx(item.id);
  return duplicate;
}
