'use strict'

/**
 * Replaces {tagName} placeholders in a template string with values from
 * the given context object. Throws if a referenced tag hasn't been
 * resolved yet — this is intentional: it surfaces broken consumes/provides
 * wiring in the data files immediately instead of silently printing
 * "undefined" in a mission description.
 */
function render(template, context) {
  return template.replace(/\{(\w+)\}/g, (match, key) => {
    if (!(key in context) || context[key] === undefined) {
      throw new Error(
        `Template references unresolved tag "{${key}}" in: "${template}". ` +
          `Available tags: [${Object.keys(context).join(', ')}]`,
      )
    }
    return context[key]
  })
}

/** Extracts the set of {placeholder} names referenced by a template string. */
function extractPlaceholders(template) {
  const matches = template.matchAll(/\{(\w+)\}/g)
  return [...matches].map((m) => m[1])
}

module.exports = { render, extractPlaceholders }
