import { assert } from "chai";
import {
  areItemsDuplicates,
  extractYear,
  getDuplicateSignature,
  normalizeDOI,
  normalizeISBN,
} from "../src/modules/noDuplicates";

type MockItemInput = {
  id: number;
  firstCreator?: string;
  isRegularItem?: boolean;
  isFeedItem?: boolean;
  DOI?: string;
  ISBN?: string;
  title?: string;
  date?: string;
};

function makeItem(input: MockItemInput) {
  const fieldMap = {
    DOI: input.DOI || "",
    ISBN: input.ISBN || "",
    title: input.title || "",
    date: input.date || "",
  };

  return {
    id: input.id,
    libraryID: 1,
    firstCreator: input.firstCreator || "",
    isFeedItem: input.isFeedItem || false,
    isRegularItem: () => input.isRegularItem !== false,
    getField: (field: keyof typeof fieldMap) => fieldMap[field],
  };
}

describe("noDuplicates", function () {
  it("normalizes DOI and ISBN values", function () {
    assert.equal(normalizeDOI("https://doi.org/10.1000/ABC  "), "10.1000/abc");
    assert.equal(normalizeISBN("978-1-4028-9462-6"), "9781402894626");
  });

  it("extracts year from date field", function () {
    assert.equal(extractYear("2021-05-09"), "2021");
    assert.equal(extractYear("Spring"), "");
  });

  it("creates DOI signature before other metadata", function () {
    const signature = getDuplicateSignature(
      makeItem({
        id: 1,
        DOI: "10.1000/xyz",
        ISBN: "9781402894626",
        title: "Ignored",
      }) as any,
    );

    assert.deepEqual(signature, {
      kind: "doi",
      value: "10.1000/xyz",
    });
  });

  it("detects duplicates by title+creator+year when DOI/ISBN are absent", function () {
    const first = makeItem({
      id: 1,
      title: "My Title",
      firstCreator: "Ada Lovelace",
      date: "2024-02-01",
    });
    const second = makeItem({
      id: 2,
      title: "  my   title ",
      firstCreator: "ada lovelace",
      date: "2024",
    });

    assert.isTrue(areItemsDuplicates(first as any, second as any));
  });

  it("does not create a title-based signature without creator and year", function () {
    const signature = getDuplicateSignature(
      makeItem({
        id: 3,
        title: "Untyped document",
      }) as any,
    );

    assert.isNull(signature);
  });
});
