# Third-party code notices

## SentenceChunker and speakable

`src/core/agent/speechText.ts` adapts the sentence chunker and text-to-speech cleanup
helpers from [Capri Companion](https://github.com/TheAgencyMGE/capri-companion/blob/c094ec1e74941c075cf0a2ce5ab340a58a3c6344/src/main/ai/actionStream.ts).
Changes: French spoken substitutions, naming and module extraction. No Capri artwork,
animation, voice, persona prompt or noncommercial Capri Desktop code is included.

MIT License

Copyright (c) 2026 Capri Companion contributors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

This license covers the source code only. Capri, Cyberpunk and Cyberpunk: Edgerunners
are the property of their respective owners; see the source project's THIRD_PARTY_LICENSES.md.

## Runtime dependencies

Persona also uses Tauri, the Microsoft windows-rs bindings, reqwest, Tokio, Serde
and their dependencies under their respective licenses. This notice does not
replace those projects' license terms.
