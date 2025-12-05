import whyDidYouRender from '@welldone-software/why-did-you-render';
import React from 'react';
console.log('WDYR loaded!');

if (
  import.meta.env.MODE === 'development' ||
  import.meta.env.MODE === 'local'
) {
  whyDidYouRender(React, {
    trackAllPureComponents: true,
    trackHooks: true,
    // collapseGroups: true,

    // logOnDifferentValues: true,
  });
}
