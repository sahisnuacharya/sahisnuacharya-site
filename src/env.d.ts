/// <reference types="astro/client" />

declare namespace App {
  interface Locals {
    currency: import('./lib/format').Currency;
    theme: 'light' | 'dark' | null;
    nonce: string;
    admin: import('./lib/auth').AdminSession | null;
  }
}
