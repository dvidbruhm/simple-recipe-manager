import { connect as connectNet, type Socket } from "node:net";
import { connect as connectTls } from "node:tls";
import type { SmtpConfig } from "@/config";

export interface OutgoingMail {
	to: string;
	subject: string;
	body: string;
}

export class EmailError extends Error {
	constructor(
		message: string,
		public readonly cause?: unknown,
	) {
		super(message);
		this.name = "EmailError";
	}
}

export interface Mailer {
	sendResetEmail(to: string, resetUrl: string): Promise<void>;
}

interface SmtpDialogue {
	socket: Socket;
	secured: boolean;
}

function ensureCode(line: string, expected: number): void {
	const code = Number.parseInt(line.slice(0, 3), 10);
	if (Number.isNaN(code)) throw new EmailError(`Unexpected SMTP reply: ${line}`);
	if (Math.floor(code / 100) !== Math.floor(expected / 100) && code !== expected) {
		throw new EmailError(`SMTP expected ${expected}, got: ${line}`);
	}
}

async function readReply(dialogue: SmtpDialogue, expectedCode: number): Promise<string> {
	return new Promise((resolve, reject) => {
		let buffer = "";
		const onData = (chunk: Buffer) => {
			buffer += chunk.toString("utf-8");
			for (;;) {
				const idx = buffer.indexOf("\r\n");
				if (idx < 0) break;
				const line = buffer.slice(0, idx);
				buffer = buffer.slice(idx + 2);
				if (line.length < 4) continue;
				if (line[3] === " ") {
					dialogue.socket.off("data", onData);
					dialogue.socket.off("error", onError);
					try {
						ensureCode(line, expectedCode);
					} catch (e) {
						reject(e);
						return;
					}
					resolve(line);
					return;
				}
			}
		};
		const onError = (err: Error) => {
			dialogue.socket.off("data", onData);
			reject(new EmailError("SMTP socket error", err));
		};
		dialogue.socket.on("data", onData);
		dialogue.socket.on("error", onError);
	});
}

function sendCommand(dialogue: SmtpDialogue, cmd: string): void {
	dialogue.socket.write(`${cmd}\r\n`);
}

async function ehlo(dialogue: SmtpDialogue, hostname: string): Promise<string[]> {
	sendCommand(dialogue, `EHLO ${hostname}`);
	const reply = await readReply(dialogue, 250);
	return reply.split("\r\n").map((l) => l.slice(4));
}

function buildMessage(config: SmtpConfig, mail: OutgoingMail): string {
	const date = new Date().toUTCString();
	const messageId = `<${Date.now()}.${Math.random().toString(36).slice(2)}@recipe-manager.local>`;
	const headers = [
		`From: ${config.from}`,
		`To: ${mail.to}`,
		`Subject: ${mail.subject}`,
		`Date: ${date}`,
		`Message-ID: ${messageId}`,
		"MIME-Version: 1.0",
		"Content-Type: text/plain; charset=utf-8",
		"Content-Transfer-Encoding: 7bit",
	].join("\r\n");
	const body = mail.body.replace(/\r?\n/g, "\r\n").replace(/^\./gm, "..");
	return `${headers}\r\n\r\n${body}`;
}

function encodeAuthPlain(user: string, pass: string): string {
	const buf = Buffer.from(`\0${user}\0${pass}`, "utf-8");
	return buf.toString("base64");
}

async function attemptStartTls(dialogue: SmtpDialogue, hostname: string): Promise<SmtpDialogue> {
	sendCommand(dialogue, "STARTTLS");
	await readReply(dialogue, 220);
	const tlsSocket = connectTls({
		socket: dialogue.socket,
		servername: hostname,
		ALPNProtocols: undefined,
	});
	await new Promise<void>((resolve, reject) => {
		tlsSocket.once("secureConnect", resolve);
		tlsSocket.once("error", (err) => reject(new EmailError("STARTTLS handshake failed", err)));
	});
	return { socket: tlsSocket as unknown as Socket, secured: true };
}

export async function sendMail(config: SmtpConfig, mail: OutgoingMail): Promise<void> {
	const { host, port, user, pass, secure } = config;
	let socket: Socket;
	if (secure) {
		socket = await new Promise<Socket>((resolve, reject) => {
			const s = connectTls({ host, port, servername: host }, () => resolve(s as unknown as Socket));
			s.once("error", (err) =>
				reject(new EmailError(`TLS connect to ${host}:${port} failed`, err)),
			);
		});
	} else {
		socket = await new Promise<Socket>((resolve, reject) => {
			const s = connectNet({ host, port }, () => resolve(s));
			s.once("error", (err) => reject(new EmailError(`Connect to ${host}:${port} failed`, err)));
		});
	}

	let dialogue: SmtpDialogue = { socket, secured: secure };
	try {
		await readReply(dialogue, 220);
		const capabilities = await ehlo(dialogue, "recipe-manager.local");

		if (!secure && capabilities.some((c) => c.toUpperCase().startsWith("STARTTLS"))) {
			dialogue = await attemptStartTls(dialogue, host);
			await ehlo(dialogue, "recipe-manager.local");
		}

		if (user && pass) {
			const caps = capabilities.map((c) => c.toUpperCase());
			if (caps.some((c) => c.startsWith("AUTH"))) {
				sendCommand(dialogue, `AUTH PLAIN ${encodeAuthPlain(user, pass)}`);
				await readReply(dialogue, 235);
			}
		}

		const fromAddr = extractAddress(config.from);
		const toAddr = extractAddress(mail.to);
		sendCommand(dialogue, `MAIL FROM:<${fromAddr}>`);
		await readReply(dialogue, 250);
		sendCommand(dialogue, `RCPT TO:<${toAddr}>`);
		await readReply(dialogue, 250);
		sendCommand(dialogue, "DATA");
		await readReply(dialogue, 354);
		const message = buildMessage(config, mail);
		dialogue.socket.write(message);
		dialogue.socket.write("\r\n.\r\n");
		await readReply(dialogue, 250);
		sendCommand(dialogue, "QUIT");
		try {
			dialogue.socket.end();
		} catch {
			// ignore
		}
	} finally {
		try {
			dialogue.socket.destroy();
		} catch {
			// ignore
		}
	}
}

function extractAddress(header: string): string {
	const lt = header.lastIndexOf("<");
	const gt = header.lastIndexOf(">");
	if (lt >= 0 && gt > lt) return header.slice(lt + 1, gt);
	return header.trim();
}

export function buildSmtpMailer(config: SmtpConfig): Mailer {
	return {
		async sendResetEmail(to: string, resetUrl: string): Promise<void> {
			const body = [
				"A password reset was requested for your Recipe Manager account.",
				"",
				"Reset your password (link valid for 1 hour):",
				resetUrl,
				"",
				"If you didn't request this, you can safely ignore this email.",
				"",
				"— Recipe Manager",
			].join("\n");
			await sendMail(config, {
				to,
				subject: "Recipe Manager — reset your password",
				body,
			});
		},
	};
}

export class CapturingMailer implements Mailer {
	public sent: { to: string; resetUrl: string }[] = [];

	async sendResetEmail(to: string, resetUrl: string): Promise<void> {
		this.sent.push({ to, resetUrl });
	}

	reset(): void {
		this.sent = [];
	}
}
