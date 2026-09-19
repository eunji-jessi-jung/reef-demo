/* The landing page has no behaviour of its own — the shell loads the data, fills the
   copy and keeps the language toggle. Kept as its own module so the page does not pull
   in the comparison code it never uses. */
import { boot } from './site.js?v=c69a150e';

boot();
