import { SMM } from '../smm';
import { isOutsideContainer, uuidv4 } from '../util';
import { attachBasicGamepadHandler } from './basic-handler';
import { BTN_CODE } from './buttons';
import {
  buildGamepadTree,
  children as childrenFilter,
  GamepadTree,
  siblings as siblingsFilter,
} from './tree';

const gamepadRoot = (id: string) => `gamepad-root-${id}`;

export class GamepadHandler {
  private readonly smm: SMM;
  private readonly id: string;
  root: HTMLElement;
  tree!: GamepadTree;
  focusPath!: string;
  rootExitCallback?: () => void;
  basicHandlerId?: string;

  constructor({
    smm,
    root,
    rootExitCallback,
  }: {
    smm: SMM;
    root: HTMLElement;
    rootExitCallback?: GamepadHandler['rootExitCallback'];
  }) {
    this.smm = smm;
    this.id = uuidv4();
    this.root = root;
    this.rootExitCallback = rootExitCallback;

    this.setup();
  }

  private setup() {
    this.tree = buildGamepadTree(this.root);

    this.smm._setActiveGamepadHandler(this);

    const initialFocusEl = Object.values(this.tree).find(
      (child) => child.initialFocus
    );
    if (!initialFocusEl) {
      // TODO: make it more explicit if a page/plugin has gamepad support?
      console.log(
        'GamepadHandler - Initial focus item not found, using basic handler...'
      );
      this.basicHandlerId = attachBasicGamepadHandler(() => {
        this.rootExitCallback?.();
        this.smm._setActiveGamepadHandler(undefined);
      });
      return;
    }
    this.focusPath = initialFocusEl.name;
    this.updateFocused(this.focusPath);

    this.smm.ButtonInterceptors.addInterceptor({
      id: gamepadRoot(this.id),
      handler: (buttonCode) =>
        this.handleButtonPress({
          buttonCode,
          interceptorId: gamepadRoot(this.id),
          onExit: () => {
            this.smm._setActiveGamepadHandler(undefined);
            this.rootExitCallback?.();
          },
        }),
    });
  }

  cleanup() {
    this.smm.ButtonInterceptors.removeInterceptor(gamepadRoot(this.id));
    this.root
      .querySelectorAll('.cs-gp-focus')
      .forEach((node) => node.classList.remove('cs-gp-focus'));
  }

  private updateFocused(newFocusPath: string) {
    const curFocus = this.tree[this.focusPath];
    if (curFocus) {
      curFocus.el.classList.remove('cs-gp-focus');
    }

    document
      .querySelectorAll('.cs-gp-focus')
      .forEach((node) => node.classList.remove('cs-gp-focus'));

    const newFocusEl = this.tree[newFocusPath].el;
    newFocusEl.classList.add('cs-gp-focus');

    this.focusPath = newFocusPath;

    // Scroll newly focused element into view if needed
    if (isOutsideContainer(newFocusEl, this.root)) {
      newFocusEl.scrollIntoView({ behavior: 'smooth' });
    }
  }

  recalculateTree() {
    // If a basic handler is attached, redo setup to see if we can have proper
    // gamepad support now
    if (this.basicHandlerId) {
      this.smm.ButtonInterceptors.removeInterceptor(this.basicHandlerId);
      this.basicHandlerId = undefined;
      this.setup();
      return;
    }

    this.tree = buildGamepadTree(this.root);

    // If currently focused disappears, find initial focus again
    if (!this.tree[this.focusPath]) {
      const initialFocusEl = Object.values(this.tree).find(
        (child) => child.initialFocus
      );
      if (!initialFocusEl) {
        throw new Error(
          'Focused child dissapeared, new child with initial focus could not be found'
        );
      }
      this.focusPath = initialFocusEl.name;
      this.updateFocused(this.focusPath);

      this.smm.ButtonInterceptors.removeAfter(gamepadRoot(this.id));
    }
  }

  private move(direction: 'up' | 'down') {
    const cur = this.tree[this.focusPath];
    const siblings = Object.values(this.tree).filter(siblingsFilter(cur));
    const next = siblings.find(
      (s) => s.position === cur.position + (direction === 'up' ? -1 : 1)
    );
    if (next) {
      this.updateFocused(next.name);
    }
  }

  private enterGroup(groupName: string) {
    const children = Object.values(this.tree).filter(childrenFilter(groupName));
    if (!children[0]) {
      return;
    }

    this.updateFocused(children[0].name);

    const exitGroup = () => {
      this.updateFocused(groupName);
    };

    const interceptorId = `gamepad-${groupName}-${this.id}`;
    this.smm.ButtonInterceptors.addInterceptor({
      id: interceptorId,
      handler: (buttonCode) =>
        this.handleButtonPress({
          buttonCode,
          interceptorId,
          onExit: exitGroup,
        }),
    });
  }

  private handleButtonPress({
    buttonCode,
    interceptorId,
    onExit,
  }: {
    buttonCode: number;
    interceptorId: string;
    onExit?: () => void;
  }): boolean {
    try {
      this.recalculateTree();
    } catch (err) {
      this.smm.ButtonInterceptors.removeInterceptor(interceptorId);
      onExit?.();
      console.error(err);
    }

    switch (buttonCode) {
      case BTN_CODE.UP:
      case BTN_CODE.LEFT:
        this.move('up');
        break;
      case BTN_CODE.DOWN:
      case BTN_CODE.RIGHT:
        this.move('down');
        break;

      // Enter group or trigger action on item
      case BTN_CODE.A:
        const focused = this.tree[this.focusPath];
        if (focused.type === 'group') {
          this.enterGroup(focused.name);
        }
        if (focused.type === 'item') {
          focused.el.dispatchEvent(new MouseEvent('click'));
        }
        break;

      // Exit group
      case BTN_CODE.B:
        this.smm.ButtonInterceptors.removeInterceptor(interceptorId);
        onExit?.();
        break;
    }

    return true;
  }
}
