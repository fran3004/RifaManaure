import React from 'react';
import {
  COLOMBIAN_CHANCE_DRAW_REFERENCES,
  COLOMBIAN_SPECIAL_DRAW_REFERENCES,
  COLOMBIAN_TRADITIONAL_LOTTERIES,
} from '@/hooks/useActiveRaffle';
import styles from './AdminEditRaffleModal.module.css';

const OTHER_REFERENCE = '__other_reference__';
const knownReferences = new Set<string>([
  ...COLOMBIAN_TRADITIONAL_LOTTERIES,
  ...COLOMBIAN_SPECIAL_DRAW_REFERENCES,
  ...COLOMBIAN_CHANCE_DRAW_REFERENCES,
]);

interface LotteryReferenceFieldProps {
  id: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}

export const LotteryReferenceField: React.FC<LotteryReferenceFieldProps> = ({
  id,
  value,
  onChange,
  disabled = false,
}) => {
  const isKnownReference = knownReferences.has(value);

  return (
    <>
      <select
        id={id}
        className={styles.select}
        value={isKnownReference ? value : OTHER_REFERENCE}
        onChange={(event) => {
          const nextValue = event.target.value;
          onChange(nextValue === OTHER_REFERENCE ? '' : nextValue);
        }}
        aria-describedby={`${id}-help`}
        required
        disabled={disabled}
      >
        <optgroup label="Loterías tradicionales de Colombia">
          {COLOMBIAN_TRADITIONAL_LOTTERIES.map((lottery) => (
            <option key={lottery} value={lottery}>
              {lottery}
            </option>
          ))}
        </optgroup>
        <optgroup label="Sorteos extraordinarios y en convenio">
          {COLOMBIAN_SPECIAL_DRAW_REFERENCES.map((lottery) => (
            <option key={lottery} value={lottery}>
              {lottery}
            </option>
          ))}
        </optgroup>
        <optgroup label="Sorteos de chance">
          {COLOMBIAN_CHANCE_DRAW_REFERENCES.map((draw) => (
            <option key={draw} value={draw}>
              {draw}
            </option>
          ))}
        </optgroup>
        <option value={OTHER_REFERENCE}>Otra referencia (escribir nombre)</option>
      </select>
      <p id={`${id}-help`} className={styles.lotteryCatalogHint}>
        Elige el sorteo que define el resultado. Para otra referencia, selecciónala y escribe su
        nombre; confirma que tenga un cronograma vigente.
      </p>
      {!isKnownReference && (
        <input
          type="text"
          className={styles.input}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder="Nombre exacto de la lotería o sorteo"
          aria-label="Nombre de la otra referencia del sorteo"
          required
          disabled={disabled}
        />
      )}
    </>
  );
};
