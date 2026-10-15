// Negative fixture, loaded by src/internal/learning/io-boundary.test.ts
// ("the detector fails closed on a learning file that reaches the network").
// Never compiled or imported at runtime; exists to prove the detector fails closed.
// `fetch` and `WebSocket` below need no import at all — that is the case the
// network-global half of the detector exists for.
import { request } from "node:http";
import OpenAI from "openai";

const policyText = "allow_network";

async function forbiddenFetch(): Promise<unknown> {
  const client = new OpenAI();
  const response = await fetch("https://api.example.invalid");
  const socket = new WebSocket("wss://api.example.invalid");
  return [client, response, socket, request, policyText];
}

export { forbiddenFetch };
