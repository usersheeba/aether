/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { createRoot } from 'react-dom/client';
import { DesignPlayground } from './DesignPlayground';
import '../index.css';

const container = document.getElementById('root');
if (!container) throw new Error('Root element #root was not found in design-playground.html');

createRoot(container).render(<DesignPlayground />);
