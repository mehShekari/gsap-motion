# Eval suite

Behaviour tests for `claude plugin eval`. Each directory is one case, named for
what it measures:

| Prefix | Measures |
| --- | --- |
| `trigger-` | A request that should use the skill does — including one in Persian, and one that never says "GSAP" |
| `ignore-` | A request that has nothing to do with GSAP animation leaves the skill alone |
| `outcome-` | The code or answer has a property the skill teaches, such as `ease: "none"` on a loop, or declining an unnecessary plugin |

Graders are `regex` and `tool_used` wherever possible: they are free and give
the same verdict every time. `llm` graders are kept for judgements a pattern
cannot make, with concrete PASS and FAIL conditions.

## Running

Every run is a model call billed to whoever runs it.

```bash
# From the repository root. One case, one run, no baseline: cheapest.
claude plugin eval plugins/gsap-motion --case trigger-scroll-reveal --runs 1 --ablation none

# The whole suite, with the no-plugin baseline.
claude plugin eval plugins/gsap-motion --max-cost-usd 15
```

Results are written to `results/`, which is ignored by git. Maintainers run the
full suite from the repository's **Evals** workflow.
