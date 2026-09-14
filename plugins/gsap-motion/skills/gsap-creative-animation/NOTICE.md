# Notice

This skill — its instructions, references, presets, examples, templates and
scripts — is released under the MIT License. See [LICENSE](LICENSE).

## Third-party code in the audit

`scripts/lib/vendor/parser.mjs` bundles two MIT-licensed packages, so the audit
can read JavaScript and TypeScript without installing anything. It is generated
from the versions its first lines name.

### acorn

```text
MIT License

Copyright (C) 2012-2022 by various contributors (see AUTHORS)

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
```

### @sveltejs/acorn-typescript

```text
MIT License

Copyright (c) 2022 Tyreal Hu
Copyright (c) 2025 The Svelte Team

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
```

## GSAP is licensed separately

**GSAP is not part of this skill, and it is not MIT-licensed.** The code this
skill writes uses GSAP (`gsap`, its plugins, and `@gsap/react`), which is
published by GreenSock, now part of Webflow, under the GSAP Standard License:
<https://gsap.com/standard-license>

In short, at the time of writing: GSAP and every one of its plugins are free to
use, including in commercial projects. The notable restriction is that GSAP may
not be used, without Webflow's written consent, in a tool that lets people build
visual animations without code in competition with Webflow.

That summary is not legal advice. Read the licence itself before relying on it,
and check it again when you upgrade.

This skill does not bundle or redistribute GSAP. Install it from npm.

"GSAP" and "GreenSock" are trademarks of their respective owners. This project
is not affiliated with or endorsed by GreenSock or Webflow.
