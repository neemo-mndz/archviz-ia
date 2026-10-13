# AI Rendering Knowledge Base — ArchViz AI

**Project:** ArchViz AI / SketchUp Plugin  
**Purpose:** Living research library on architectural AI rendering, geometry fidelity, control strategies, failure modes, and empirical tests.  
**Status:** Initial version  
**Last updated:** 2026-09-11

---

## 1. Scope

This document collects:

- techniques used in AI-assisted architectural rendering;
- recurring geometry-fidelity problems;
- methods used by commercial tools and open-source pipelines;
- architectural implications of image-to-image generation;
- experiments performed in ArchViz AI;
- hypotheses to test next;
- verified sources and unresolved questions.

The goal is not to build a generic image-generation library. The focus is:

> **How to generate photorealistic architectural renders while preserving the original SketchUp model as the source of geometric truth.**

---

# 2. Core problem: geometry drift

Image-generative models tend to interpret the input image as a visual suggestion rather than a strict geometric contract.

In architecture this creates specific failure modes:

- blind walls become walls with windows;
- discrete windows become continuous curtain walls;
- floors change height;
- building massing changes;
- existing walls disappear;
- fences/posts/railings disappear;
- new doors or windows appear;
- guardhouses or canopies are invented;
- parking spaces are added where none exist;
- roads/ramps are invented;
- neighboring buildings change proportions;
- repeated renders of the same view produce different massing.

This problem will be called:

## **Geometry Drift**

Geometry Drift is distinct from low image quality.

A visually attractive render may still be architecturally wrong.

---

# 3. Source of truth hierarchy

The ArchViz AI research direction should gradually separate different kinds of information.

## 3.1 Appearance source

Provides:

- colors;
- textures;
- material impression;
- atmosphere;
- context;
- vegetation;
- lighting intent.

Current source:

```text
scene.png
```

---

## 3.2 Structural source

Provides:

- edges;
- openings;
- contours;
- boundaries;
- object placement.

Candidate source:

```text
geometry.png
```

---

## 3.3 Massing source

Provides:

- occupied space;
- empty space;
- overall volume;
- silhouettes.

Candidate source:

```text
solid_geometry.png
```

---

## 3.4 Spatial source

Provides:

- distance from camera;
- foreground/background separation;
- relative spatial position;
- volumetric relationships.

Candidate:

```text
depth.png
```

---

## 3.5 Semantic source

Future sources:

```text
object_id.png
material_id.png
semantic masks
IArq output
```

These may identify:

- walls;
- windows;
- doors;
- slabs;
- vegetation;
- neighboring buildings;
- site objects.

This is outside the current MVP.

---

# 4. Techniques used in AI image control

## 4.1 Prompt-only geometry locking

Typical instruction:

```text
Preserve exactly:
- camera position
- geometry
- proportions
- architectural elements

Do not redesign.
```

### Advantages

- simple;
- model-agnostic;
- compatible with closed multimodal systems.

### Limitations

Prompt-only control is weak for strict architectural fidelity.

It can reduce redesign but does not mathematically prevent hallucinated geometry.

This has also been reported by SketchUp AI Render users who specifically requested the return of controls such as **Respect Model Geometry** because prompt instructions alone did not provide the same fidelity.

### ArchViz status

Implemented.

### Conclusion

Necessary, but insufficient.

---

# 5. Structural conditioning

## 5.1 Edge / Lineart control

Edge maps encode visible boundaries.

Examples:

```text
Canny
Lineart
Sketch edges
Technical line drawing
```

Best suited to preserving:

- façade divisions;
- window borders;
- roof outlines;
- railings;
- walls;
- fences;
- object contours.

### Limitation

Edges alone do not clearly distinguish:

```text
solid wall
vs
transparent opening
```

or:

```text
foreground edge
vs
background edge
```

### ArchViz implementation

Current experimental equivalent:

```text
geometry.png
```

generated from the SketchUp viewport using simplified style settings.

---

## 5.2 Depth control

Depth maps encode approximate camera distance per pixel.

Useful for:

- relative spatial position;
- room depth;
- façade projections;
- foreground/background separation;
- preventing volumetric collapse.

ControlNet pipelines support depth as a conditioning input.

### Potential architectural benefit

Depth may reduce:

- building height drift;
- misplaced volumes;
- changes in setbacks;
- movement of walls/objects in depth.

### Status

Not yet implemented.

---

## 5.3 Multiple structural controls

Diffusion pipelines can combine several controls.

A common example:

```text
Canny + Depth
```

The Hugging Face Diffusers documentation exposes **Multi-ControlNet** and independent conditioning scales.

Conceptually:

```text
edge weight  = 0.90
depth weight = 0.80
prompt       = appearance/style
```

### Architectural implication

Different references should have different authority.

Suggested conceptual hierarchy:

```text
1. solid geometry
2. edges
3. depth
4. appearance image
5. prompt
```

Closed multimodal models may not expose numerical conditioning weights, but the same conceptual separation remains useful.

---

# 6. Geometry-control products and market observations

## 6.1 SketchUp AI Render

Community reports refer to previous controls such as:

```text
Respect Model Geometry
Prompt Influence
```

Professional users report that removing geometry-control settings causes AI Render to alter furniture, materials, proportions and architectural elements even when prompts request preservation.

### Lesson

A dedicated geometry-control mechanism is a product-level requirement for professional architecture.

---

## 6.2 Veras / Chaos ecosystem

Veras-style workflows are integrated directly into architectural modeling environments such as SketchUp/Revit.

Relevant concepts include:

- active-view integration;
- geometry influence/control;
- reference images;
- localized editing;
- iterative refinement.

### Lesson

Being inside SketchUp reduces workflow friction, but direct integration alone does not eliminate geometry drift.

The model still requires explicit structural control.

---

## 6.3 SobreArq

Public materials position SobreArq within AI-assisted architectural rendering workflows.

At this time, the following internal implementation details have **not been publicly verified**:

- ControlNet usage;
- depth maps;
- lineart passes;
- scene graph extraction;
- face-loop analysis;
- GLB transfer;
- segmentation;
- direct SketchUp geometry conditioning.

### Knowledge-base rule

Do not attribute any of these methods to SobreArq without a verified public source.

Mark internal architecture as:

```text
Not publicly verified
```

---

# 7. ControlNet

ControlNet adds spatial conditioning to diffusion models.

Known control categories include:

- Canny edges;
- depth;
- segmentation;
- human pose;
- line art;
- other structured maps.

The control image influences the generated result independently of the text prompt.

Some implementations expose:

```text
controlnet_conditioning_scale
```

which directly controls how strongly the structural reference affects generation.

---

# 8. Multi-ControlNet

Multi-ControlNet allows several structural inputs simultaneously.

Example:

```text
Canny
+
Depth
```

Each condition can receive a separate weight.

This is highly relevant to architecture because no single 2D condition fully describes a building.

Potential architectural stack:

```text
Lineart
+
Depth
+
Segmentation
```

Possible future ArchViz engine:

```text
ArchViz Geometry Package
        ↓
ControlNet / Flux / SDXL engine
        ↓
Photorealistic render
```

---

# 9. ControlNet++

ControlNet++ addresses a known limitation of conditional diffusion:

> even when a structural condition is provided, generated images may still fail to align precisely with it.

The research introduces consistency feedback between:

```text
input condition
and
condition extracted from generated output
```

Reported improvements include stronger adherence for:

- segmentation masks;
- line-art edges;
- depth.

### Architectural implication

This strongly supports the future ArchViz idea of:

```text
GENERATE
↓
EXTRACT GEOMETRY FROM OUTPUT
↓
COMPARE AGAINST INPUT GEOMETRY
↓
REJECT / CORRECT IF NEEDED
```

This can eventually become part of a geometry-validation system.

---

# 10. Post-generation validation

A future rendering pipeline should not assume that a render is valid merely because generation completed.

Possible future architecture:

```text
SketchUp geometry
       ↓
geometry constraints
       ↓
render generation
       ↓
geometry extractor
       ↓
comparison
       ↓
PASS / FAIL
```

Possible validations:

- opening appears where none exists;
- original opening disappears;
- building silhouette changes;
- floor count changes;
- wall boundary moves;
- site wall disappears;
- post/fence disappears;
- roof elevation changes.

This could later integrate with **IArq**.

---

# 11. SketchUp as geometry database

The SketchUp plugin provides a major advantage over browser-only AI rendering.

Instead of receiving only:

```text
pixels
```

the system can access:

```text
camera
groups
components
faces
edges
materials
tags
visibility
bounding boxes
scene names
```

This enables progressively stronger geometry constraints.

---

# 12. Objective face analysis

SketchUp faces can expose loop structure.

Potential APIs:

```ruby
face.loops
face.outer_loop
```

Conceptually:

```text
Face
└── outer loop
```

may represent a continuous surface.

While:

```text
Face
├── outer loop
└── inner loop(s)
```

may indicate holes/openings.

Potential metadata:

```json
{
  "surfaceId": "x",
  "loopCount": 1,
  "innerLoopCount": 0
}
```

### Important limitation

A SketchUp window is not guaranteed to appear as an inner loop.

Models may contain:

- true wall openings;
- nested components;
- geometry placed over a wall;
- intersected geometry;
- separate façade assemblies.

Therefore:

> `innerLoopCount` is a geometric fact, not a semantic classification.

Do not infer:

```text
inner loop = window
```

without further context.

---

# 13. ArchViz experimental log

---

## AV-001 — Screenshot only

### Input

```text
scene.png
```

### Observed failures

- windows hallucinated on blind wall;
- windows reinterpreted as curtain wall;
- lot-dividing wall removed;
- neighboring posts removed;
- building height changed between renders;
- nonexistent guardhouse added;
- nonexistent parking spaces added.

### Conclusion

Screenshot + prompt is insufficient for architectural fidelity.

---

## AV-002 — Screenshot + Geometry Pass

### Input

```text
scene.png
geometry.png
scene.json
```

### Geometry pass

Generated from the same SketchUp camera using a simplified edge-focused style.

### Observed result

- general massing improved;
- geometry interpretation became more stable;
- pipeline successfully accepted multi-image input;
- geometry drift was reduced but not eliminated.

### Remaining issues

- structural references are still interpreted as visual guidance rather than strict constraints;
- no explicit occupied-vs-empty control;
- no depth condition;
- no semantic geometry validation.

### Conclusion

Geometry pass provides useful information but is not sufficient by itself.

---

## AV-003 — Geometry Truth 4B

### Planned input

```text
scene.png
geometry.png
solid_geometry.png
scene.json
geometryFacts
```

### Goal

Test whether:

```text
edge reference
+
solid-space reference
```

reduces hallucinated architecture more strongly than line geometry alone.

### Key target

Blind façade must remain blind.

---

# 14. Failure taxonomy

Use this taxonomy when logging future experiments.

## F01 — Hallucinated opening

Examples:

- new window;
- new door;
- new curtain wall.

## F02 — Missing opening

Existing window/door disappears.

## F03 — Massing drift

Building volume changes.

## F04 — Floor-height drift

Floor/roof elevations change.

## F05 — Missing object

Existing object removed.

Examples:

- fence;
- post;
- wall;
- tree;
- canopy.

## F06 — Invented object

Examples:

- guardhouse;
- parking stall;
- canopy;
- additional wall.

## F07 — Site-layout drift

Roads, sidewalks, parking or boundaries move.

## F08 — Material interpretation drift

Correct geometry remains, but material type is misread.

## F09 — Cross-render inconsistency

Same camera/model produces structurally different renders.

## F10 — Camera drift

Perspective, FOV or viewpoint changes.

---

# 15. Experiment template

Use this for all future ArchViz tests.

```markdown
## AV-XXX — Test name

### Date

YYYY-MM-DD

### Model

...

### Camera

...

### Engine

...

### Inputs

- scene.png
- geometry.png
- depth.png
- etc.

### Prompt version

...

### Settings

...

### Expected constraints

...

### Result

...

### Failure codes

F01, F03, ...

### Geometry fidelity

0–5

### Visual quality

0–5

### Notes

...

### Conclusion

...
```

---

# 16. Geometry fidelity score

Suggested internal rating:

## 5 — Exact

No meaningful geometry deviation.

## 4 — Minor

Small decorative/detail deviation only.

## 3 — Moderate

One or more architectural details altered but massing remains correct.

## 2 — Poor

Several architectural changes or missing elements.

## 1 — Severe

Major massing/opening/site modifications.

## 0 — Invalid

Render no longer represents the project.

This score should be independent from:

```text
photorealism
```

A render can be:

```text
Visual quality: 5
Geometry fidelity: 1
```

---

# 17. Research priorities

Recommended order:

## Priority 1

```text
Solid geometry pass
```

Goal:

occupied vs empty space.

---

## Priority 2

```text
Depth pass
```

Goal:

stabilize spatial relationships and volume.

---

## Priority 3

```text
Face-loop facts
```

Goal:

identify continuous surfaces and geometric openings.

---

## Priority 4

```text
Object / Material ID
```

Goal:

preserve identity and enable local control.

---

## Priority 5

```text
Post-render validation
```

Goal:

automatically detect geometry drift.

---

## Priority 6

```text
IArq integration
```

Goal:

semantic architectural understanding and validation.

---

# 18. Proposed long-term ArchViz pipeline

```text
SKETCHUP MODEL
      │
      ├── scene.png
      ├── geometry.png
      ├── solid_geometry.png
      ├── depth.png
      ├── object_id.png
      ├── material_id.png
      └── scene.json
             │
             ▼
      ARCHVIZ GEOMETRY PACKAGE
             │
             ▼
    ┌─────────────────────┐
    │ Rendering Engine    │
    │                     │
    │ Nano Banana         │
    │ Flux + ControlNet   │
    │ future engines      │
    └─────────┬───────────┘
              │
              ▼
          AI RENDER
              │
              ▼
      GEOMETRY VALIDATION
              │
         PASS / FAIL
              │
              ▼
          FINAL IMAGE
```

The renderer should eventually become engine-independent.

---

# 19. Closed multimodal model vs controllable diffusion

## Closed multimodal engine

Examples may include proprietary image-editing/generation models.

### Advantages

- strong visual quality;
- natural-language understanding;
- low implementation complexity.

### Limitations

Often no explicit access to:

```text
depth conditioning scale
edge conditioning scale
segmentation conditioning scale
```

Control must be approximated with:

- multi-reference images;
- prompt hierarchy;
- metadata;
- validation.

---

## Controllable diffusion engine

Examples:

```text
Flux + ControlNet
SDXL + ControlNet
```

### Advantages

Explicit structural conditioning.

Potential parameters:

```text
controlnet_conditioning_scale
control_guidance_start
control_guidance_end
```

Multiple controls can be composed.

### Limitations

- GPU cost;
- local hardware requirements;
- pipeline complexity;
- model/license considerations.

---

# 20. Product principle

For professional architecture:

> **Creativity must never silently override project geometry.**

The UI should eventually distinguish:

```text
Creative Render
```

from:

```text
Project-Faithful Render
```

Possible future control:

```text
GEOMETRY FIDELITY

Conceptual      ○─────
Balanced        ──○───
Strict          ─────●
```

But this slider should eventually map to real technical controls rather than prompt wording alone.

---

# 21. Verified references

## Hugging Face — ControlNet

ControlNet documentation, including structural conditioning and `controlnet_conditioning_scale`.

https://huggingface.co/docs/diffusers/using-diffusers/controlnet

Key concepts:

- Canny;
- depth;
- multiple ControlNets;
- independent conditioning scales.

---

## Hugging Face — ControlNet API

https://huggingface.co/docs/diffusers/api/pipelines/controlnet

Useful for implementation details of:

- control image;
- multiple ControlNets;
- conditioning scale;
- guidance start/end.

---

## ControlNet++ paper

**ControlNet++: Improving Conditional Controls with Efficient Consistency Feedback**

https://arxiv.org/abs/2404.07987

Relevant concept:

- consistency between requested structural condition and generated output.

---

## SketchUp Community — Respect Model Geometry

Community discussion:

**Bring back “Respect Model Geometry” and “Prompt Influence” controls in AI Render**

https://forums.sketchup.com/t/bring-back-respect-model-geometry-and-prompt-influence-controls-in-ai-render/349757

Relevant observation:

Prompt instructions alone are insufficient for strict professional geometry fidelity.

---

# 22. Sources requiring further investigation

## SobreArq

https://sobrearq.com.br/#como-funciona

Research questions:

- Does it read model geometry directly?
- Does it generate structural passes?
- Does it use depth/edge/segmentation conditioning?
- Does it operate on screenshots or model data?
- Does it use Nano Banana directly?
- Is there a plugin/extension layer?
- How does it preserve windows/openings?
- Is there post-generation geometry validation?

Do not record answers until verified.

---

## Veras / Chaos

Research questions:

- exact geometry-control mechanism;
- active-view data passed to model;
- role of geometry override;
- use of reference images;
- whether depth/line passes are internally generated;
- local editing architecture.

---

# 23. Open research questions

1. How much fidelity improvement comes from `geometry.png` alone?
2. Does `solid_geometry.png` significantly reduce hallucinated openings?
3. Does depth reduce floor-height and massing drift?
4. Can face-loop analysis detect the problematic blind wall reliably?
5. Can geometry validation identify invented windows automatically?
6. Can a lightweight local model extract architectural differences from:
   ```text
   geometry reference vs final render
   ```
7. Can Nano Banana reliably use three simultaneous references?
8. At what point does a ControlNet-based engine outperform the closed multimodal engine for strict architectural fidelity?
9. Can we preserve model fidelity without increasing render latency excessively?
10. Can the plugin generate all structural passes without visibly modifying the SketchUp model?

---

# 24. Decision log

## 2026-09-10

Decision:

Transform ArchViz AI into a SketchUp plugin while preserving the existing web application and local rendering pipeline.

## 2026-09-10

Decision:

Use SketchUp model data as an additional source of truth instead of relying solely on exported screenshots.

## 2026-09-10

Decision:

IArq is not required for the initial geometry-control MVP.

## 2026-09-11

Decision:

Geometry fidelity experiments should be evidence-driven.

Prompt engineering alone will not be treated as a sufficient solution.

## 2026-09-11

Decision:

Begin with:

```text
scene
→ geometry
→ solid geometry
→ depth
→ IDs
→ semantic validation
```

before adding architectural semantic intelligence.

---

# 25. Current working hypothesis

The best path for ArchViz AI is not:

```text
better prompt
```

but:

```text
more authoritative model-derived constraints
+
explicit hierarchy between appearance and geometry
+
post-generation validation
```

The SketchUp plugin therefore becomes more than a convenient interface.

It becomes the mechanism that converts the `.skp` file into a structured **Geometry Truth Package** for AI rendering.
