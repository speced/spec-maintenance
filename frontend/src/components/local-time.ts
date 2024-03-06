import { localFormatter } from '@lib/formatTime.js';
import { LitElement, html, type PropertyDeclaration } from 'lit';
import { customElement, property } from 'lit/decorators.js';

const dateProperty: PropertyDeclaration<Date | null> = {
    type: Object,
    converter(date: string | null) {
        const result = new Date(date ?? "");
        if (isNaN(result.getTime())) return null;
        return result;
    },
}

@customElement('local-time')
export class LocalTime extends LitElement {
    // The single time represented by this element.
    @property(dateProperty)
    datetime: Date | null = null;

    // The range of time represented by this element.
    @property(dateProperty)
    from: Date | null = null
    @property(dateProperty)
    to: Date | null = null

    render() {
        if (this.datetime) {
            return html`${localFormatter.format(this.datetime)}`;
        } else if (this.from && this.to) {
            return html`${localFormatter.formatRange(this.from, this.to)}`;
        } else {
            console.error(this, "should have 'datetime' or 'from' and 'to' attributes.");
            return html`<slot></slot>`;
        }
    }
}
