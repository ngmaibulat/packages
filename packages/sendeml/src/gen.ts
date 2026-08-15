import { faker } from "@faker-js/faker";

function generateMessageId() {
    const now = new Date().getTime();
    const random = Math.random().toString().substr(2, 10);
    const messageId = `<${now}.${random}@example.com>`;

    return messageId;
}

export function genPIIData(count: number, pci: boolean = false) {
    // Define the header for the CSV file
    let header = "FirstName, LastName, Email, Phone";

    if (pci) {
        header += "Card, IBAN";
    }

    header += "\n";

    // Generate the fake PII data
    let fakeData = "";

    for (let i = 0; i < count; i++) {
        const firstName = faker.name.firstName();
        const lastName = faker.name.lastName();
        const email = faker.internet.email(firstName, lastName);
        const phoneNumber = faker.phone.number();

        if (pci) {
            const card = faker.finance.creditCardNumber();
            const iban = faker.finance.iban();
            fakeData += `${firstName}, ${lastName}, ${email}, ${phoneNumber}, ${card}, ${iban}\n`;
        } else {
            fakeData += `${firstName}, ${lastName}, ${email}, ${phoneNumber}\n`;
        }
    }

    return header + fakeData;
}

export function generateEML(from: string, to: string, subject: string, text: string): string {
    const date = new Date().toUTCString();
    const messageId = generateMessageId();
    const eml =
        `From: ${from}\r\n` +
        `To: ${to}\r\n` +
        `Date: ${date}\r\n` +
        `Message-ID: ${messageId}\r\n` +
        `Subject: ${subject}\r\n` +
        `Content-Type: text/plain; charset=UTF-8\r\n\r\n` +
        `${text}\r\n`;

    return eml;
}

export function genPIIEml(from: string, to: string, subject: string, count: number, pci: boolean = false) {
    const text = genPIIData(count);
    const res = generateEML(from, to, subject, text);
    return res;
}

const from = "sender@example.com";
const to = "recipient@example.com";
const subject = "Test Email";
const res = genPIIEml(from, to, subject, 20);

console.log(res);
