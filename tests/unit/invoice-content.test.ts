import { existsSync } from "fs";
import { writeFile } from "fs/promises";
import { PDFDocument } from "pdf-lib";
import { generateInvoice } from "../../lib/invoice";

jest.mock("fs", () => ({
  existsSync: jest.fn(),
}));

jest.mock("fs/promises", () => ({
  writeFile: jest.fn(),
}));

jest.mock("pdf-lib", () => ({
  PDFDocument: {
    create: jest.fn(),
  },
  StandardFonts: {
    Helvetica: "Helvetica",
    HelveticaBold: "HelveticaBold",
  },
  rgb: jest.fn((red: number, green: number, blue: number) => ({
    red,
    green,
    blue,
  })),
}));

const mockedExistsSync = jest.mocked(existsSync);
const mockedWriteFile = jest.mocked(writeFile);
const mockedCreate = jest.mocked(PDFDocument.create);

const createPdfDouble = () => {
  const page = {
    getSize: jest.fn(() => ({ width: 612, height: 792 })),
    drawText: jest.fn(),
    drawLine: jest.fn(),
  };
  const pdfDocument = {
    addPage: jest.fn(() => page),
    embedFont: jest.fn(async (font: string) => font),
    save: jest.fn(async () => new Uint8Array([37, 80, 68, 70])),
  };

  mockedCreate.mockResolvedValue(
    pdfDocument as unknown as Awaited<ReturnType<typeof PDFDocument.create>>
  );

  return { page, pdfDocument };
};

const baseInvoice = {
  orderId: "ORD-001",
  createdAt: new Date(2025, 0, 15, 12),
  customerName: "Alice",
  customerEmail: "alice@example.com",
  address: {
    street: "123 Main Street",
    city: "New York",
    state: "NY",
    zipCode: "10001",
    country: "USA",
  },
  items: [],
  total: 0,
};

describe("generateInvoice content", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedExistsSync.mockReturnValue(true);
    mockedWriteFile.mockResolvedValue(undefined);
  });

  it("renders invoice metadata and billing address", async () => {
    const { page } = createPdfDouble();

    await generateInvoice(baseInvoice);

    const texts = page.drawText.mock.calls.map(([text]) => text);
    expect(texts).toEqual(
      expect.arrayContaining([
        "OSS - OopsSec Store",
        "INVOICE",
        "Invoice Number: ORD-001",
        "Date: January 15, 2025",
        "Bill To:",
        "Alice",
        "alice@example.com",
        "123 Main Street",
        "New York, NY 10001",
        "USA",
        "Order Items:",
        "Total:",
        "Thank you for shopping with OopsSec Store!",
      ])
    );
  });

  it("renders a string date using the same invoice date format", async () => {
    const { page } = createPdfDouble();

    await generateInvoice({
      ...baseInvoice,
      createdAt: "2025-06-20T12:00:00.000Z",
    });

    expect(page.drawText).toHaveBeenCalledWith(
      "Date: June 20, 2025",
      expect.objectContaining({ x: 50, size: 10 })
    );
  });

  it("renders item quantities, prices, line totals, and the invoice total", async () => {
    const { page } = createPdfDouble();

    await generateInvoice({
      ...baseInvoice,
      items: [{ name: "Keyboard", quantity: 3, priceAtPurchase: 19.99 }],
      total: 59.97,
    });

    expect(page.drawText).toHaveBeenCalledWith(
      "Keyboard",
      expect.objectContaining({ x: 50 })
    );
    expect(page.drawText).toHaveBeenCalledWith(
      "3",
      expect.objectContaining({ x: 350 })
    );
    expect(page.drawText).toHaveBeenCalledWith(
      "$19.99",
      expect.objectContaining({ x: 400 })
    );
    expect(page.drawText).toHaveBeenCalledWith(
      "$59.97",
      expect.objectContaining({ x: 480 })
    );
    expect(page.drawText).toHaveBeenCalledWith(
      "Total:",
      expect.objectContaining({ x: 400 })
    );
    expect(page.drawText).toHaveBeenCalledWith(
      "$59.97",
      expect.objectContaining({ x: 480, size: 12 })
    );
  });

  it("keeps names up to 40 characters and truncates names over 40", async () => {
    const { page } = createPdfDouble();
    const exactlyFortyCharacters = "A".repeat(40);
    const overFortyCharacters = "B".repeat(41);

    await generateInvoice({
      ...baseInvoice,
      items: [
        { name: exactlyFortyCharacters, quantity: 1, priceAtPurchase: 1 },
        { name: overFortyCharacters, quantity: 1, priceAtPurchase: 2 },
      ],
      total: 3,
    });

    expect(page.drawText).toHaveBeenCalledWith(
      exactlyFortyCharacters,
      expect.objectContaining({ x: 50 })
    );
    expect(page.drawText).toHaveBeenCalledWith(
      `${"B".repeat(40)}...`,
      expect.objectContaining({ x: 50 })
    );
    expect(page.drawText).not.toHaveBeenCalledWith(
      overFortyCharacters,
      expect.anything()
    );
  });

  it("renders no item rows when the invoice has no items", async () => {
    const { page } = createPdfDouble();

    await generateInvoice(baseInvoice);

    const texts = page.drawText.mock.calls.map(([text]) => text);
    expect(texts).not.toContain("$NaN");
    expect(texts).toContain("Order Items:");
    expect(page.drawText).toHaveBeenCalledTimes(13);
  });
});
