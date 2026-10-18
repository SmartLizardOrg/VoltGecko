import { ProductLibrary } from '../components/ProductLibrary';
import { SCHNEIDER_PRODUCTS } from '../products/schneider';
import type { CatalogProduct } from '../products/types';

export default function ManufacturerLibrary({
  onAdd,
  onClose
}: {
  onAdd: (product: CatalogProduct) => void;
  onClose: () => void;
}) {
  return <ProductLibrary products={SCHNEIDER_PRODUCTS} onAdd={onAdd} onClose={onClose} />;
}
