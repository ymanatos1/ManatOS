# Translation and Content Contracts

## Reference grammar

A shared dictionary reference has the form `@GROUP.key`, where `GROUP` is exactly one of `CO`, `PL`, `SS`, `EN` or `CM`, followed by a case-sensitive dictionary key. The resolver recognizes that grammar and leaves unrelated strings outside the dictionary-reference mechanism.

```ts
// Examples of source declarations (the keys are from real metadata usage).
name: '@PL.Panoptes.Name'
label: '@SS.platforms.panoptes.surveillance.label.Surveillance'
```

There is also a small literal form: `{ EN: 'English label', EL: 'Ελληνική ετικέτα' }`. Both are presentation descriptions; neither belongs in a persisted business field merely to supply its label.

The current resolver is implemented in `shared/src/multilingual/metadata/index.ts`; its type is `MetadataLanguage = 'EN' | 'EL'`. Where a dictionary key or requested translation is missing, consumers should respect the actual resolver's fallback result and not invent a second fallback rule in a component.

## Component-facing resolution

`multilingual(language, keysOrLabels, variables?)` provides a keyed text object with methods for resolving a reference, selecting a complete sentence, formatting named parameters and translating recognized status messages.

```ts
const text = multilingual('EL', {
  title: '@PL.Panoptes.Name',
  message: { EN: 'Loaded {count} records', EL: 'Φορτώθηκαν {count} εγγραφές' },
});
const message = text.format(
  { EN: 'Loaded {count} records', EL: 'Φορτώθηκαν {count} εγγραφές' },
  { count: 4 },
);
```

This is an **illustrative component use** of the real function signature, not an application-specific checked-in component. Named placeholders make the whole phrase localizable; translating `"Loaded" + count + "records"` separately does not.

## Static content is a separate channel

Full static pages and embedded popup HTML are content, not merely dictionary values. Their translation must happen through the static-content translation path before content is composed into a UI surface. Reactive values and event handling remain owned by the runtime and evaluator. Keep translated content independent of the DOM adapter's component construction, and maintain safe HTML handling when interpolating application-controlled or user-controlled values.

## Validation questions

- Does the value identify business data or only describe it to a human?
- Is the dictionary group canonical for this kind of message?
- Does switching language rebuild the right projection without modifying the underlying model?
- Is the sentence complete, with all dynamic information expressed as parameters?
- Are missing translations observable and testable?
- Will the same reference work in Angular and EJS presentations without framework-specific dictionary forks?

For the system-wide ownership model see [Multilingual Infrastructure](Multilingual-Infrastructure.md).
