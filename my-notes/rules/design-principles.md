# Design Principles

Earned through the period picker brainstorming (8 rounds of iteration). These apply to all UI work.

## 1. User psychology first

Think about who's using it before designing anything. A founder thinks "how's Q1 looking?" A CPA thinks "I need trailing 12M for the bank loan package." Design for how they _think_, not for what the software _can do_.

## 2. Infer, don't ask

The best UI decision is the one the user doesn't have to make. Period mode is inferred from what you tap — no category-then-value dance. Apply this everywhere: if you can derive intent from context, do it.

## 3. Spatial stability

Users should never feel teleported. Popovers open inline, selections update adjacent panels, drill-down expands in place. The page doesn't jump.

## 4. Calm confidence

Generous whitespace, muted controls, one clear visual hero per view. The user should feel reassured, not overwhelmed. Dense ≠ professional. Calm = professional.

## 5. No clog

Only show what's needed. Compare section hides when the mode doesn't support it. Controls collapse to icons. If a feature isn't relevant to the current context, it shouldn't be visible.

## 6. Simple, distinct

Each element has one clear purpose. One hero per section. Don't make elements compete for attention. The period label is the hero of the toolbar — everything else is supporting.

## 7. Pick the thing, not the category

Both founders and CPAs think "I want Q1" not "I want quarterly mode, then Q1." Flatten decision trees. Group by what users _want to select_, not by software taxonomy.

## 8. Responsive = same information, different container

Mobile doesn't get a degraded experience. Same controls, same information — different container (sheet vs popover, stacked vs side-by-side). The user's mental model shouldn't change between devices.

## Anti-patterns to avoid

- Scrollable horizontal chip strips on mobile
- Burying zero-config options (like T12M) inside popovers
- Mode selectors that add a step before the actual selection
- Cramming too many options into a segmented control (max 4-5)
- Accepting design recommendations without pushback — be objective
