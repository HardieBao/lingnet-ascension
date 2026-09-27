# Third-party component notices

This notice covers the identified materials below, not every dependency or asset
in Lingnet Ascension. Original third-party portions retain their own licenses;
the project's AGPL-3.0-only / CC BY-SA 4.0 declarations do not replace them.
The full comparison record is in `docs/licenses/component-provenance.md` in the
source distribution.

| Material | Identified upstream and license |
| --- | --- |
| Original portions of the 61 files in `site/components/ui/` | [shadcn/ui registry](https://github.com/shadcn-ui/ui/tree/d0fae528221011f75a8c64a917073904c2847493/apps/v4/registry/new-york-v4/ui), MIT, Copyright (c) 2023 shadcn |
| `site/vendor/shadcn-tailwind-4.13.0.css` | [shadcn/ui CSS](https://github.com/shadcn-ui/ui/blob/d0fae528221011f75a8c64a917073904c2847493/packages/shadcn/src/tailwind.css), MIT, Copyright (c) 2023 shadcn |
| `radix-ui` 1.6.7 | [Radix license](https://github.com/radix-ui/primitives/blob/9aebdd45abd447b84092ecf20f8bcd27f2398c36/LICENSE), MIT, Copyright (c) 2022 WorkOS |
| `@base-ui/react` 1.8.0 | [Base UI license](https://github.com/mui/base-ui/blob/47b40521eab921c2756bf9bdb0b0f07fbfdb8c8c/LICENSE), MIT, Copyright (c) 2019 Material-UI SAS |
| `@shadcn/react` 0.3.1 | [shadcn/react license](https://github.com/shadcn-ui/ui/blob/63c1308d112b6b1205d86244a156cca1abef5087/LICENSE.md), MIT, Copyright (c) 2023 shadcn |

Package versions are those resolved in `site/package-lock.json` at the
2026-09-27 inspection, not the version ranges in `package.json`. For 58 registry
files, complete text matches after only the recorded local import-path mapping
and CRLF/LF normalization. `chart.tsx`, `progress.tsx`, and `sidebar.tsx` have
additional local changes. These comparisons identify upstream portions; they do
not establish the authorship or independent authorization of the local changes.
No contributor identity is inferred here.

The notices below reproduce the identified license texts. This is not a full
transitive-dependency audit, verification of provenance signatures, or a legal
compatibility conclusion. Other distributed materials still require review.
Next.js template SVG notices are recorded separately in
[THIRD_PARTY_ASSETS.md](THIRD_PARTY_ASSETS.md).

## shadcn/ui and shadcn/react

MIT License

Copyright (c) 2023 shadcn

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

## Radix

MIT License

Copyright (c) 2022 WorkOS

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

## Base UI

MIT License

Copyright (c) 2019 Material-UI SAS

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
