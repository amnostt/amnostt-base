import { describe, expect, it } from 'vitest';

describe('web test infrastructure', () => {
  it('runs in jsdom with jest-dom matchers available', () => {
    const element = document.createElement('button');
    element.textContent = 'Continue';
    document.body.append(element);

    expect(element).toBeInTheDocument();
    expect(element).toHaveTextContent('Continue');
  });
});
