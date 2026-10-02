"use client";

import { useState } from "react";
import { QuietAction } from "@seametry/ui";
import { ModalSheet } from "@seametry/ui/modal-sheet";
import styles from "./modal-sheet-specimen.module.css";

export function ModalSheetSpecimen() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <QuietAction onClick={() => setOpen(true)}>Open order sheet</QuietAction>
      <ModalSheet open={open} onClose={() => setOpen(false)} title="Order sheet" register="Allocation fixture" closeLabel="Close order sheet">
        <div className={styles.fixture}>
          <p>Direct ownership</p>
          <dl>
            <div>
              <dt>Spend</dt>
              <dd>250 USDC</dd>
            </div>
            <div>
              <dt>Constituents</dt>
              <dd>AAPLx</dd>
            </div>
            <div>
              <dt>Execution</dt>
              <dd>One swap per constituent</dd>
            </div>
          </dl>
          <small>Labelled fixture. Reduced motion opens at the final state.</small>
        </div>
      </ModalSheet>
    </>
  );
}
