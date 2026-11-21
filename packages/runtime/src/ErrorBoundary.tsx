import { Component, type ReactNode } from 'react';

interface Props {
  /** Called with the error thrown while rendering the children. */
  onError: (error: Error) => void;
  children: ReactNode;
  /** When this value changes, the children are rendered again. */
  resetKey?: unknown;
}

/** Renders nothing in place of children that threw while rendering, and reports the error through `onError`. */
export class ErrorBoundary extends Component<Props, { failed: boolean; key: unknown }> {
  state = { failed: false, key: this.props.resetKey };

  static getDerivedStateFromProps(props: Props, state: { failed: boolean; key: unknown }) {
    if (props.resetKey !== state.key) return { failed: false, key: props.resetKey };
    return null;
  }

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: Error) {
    this.props.onError(error);
  }

  render() {
    return this.state.failed ? null : this.props.children;
  }
}
