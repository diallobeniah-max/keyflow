# KeyFlow color helper

This short-lived helper converts bounded Lab pixel buffers to sRGB using Little CMS (`lcms2`, MIT license). It does not load files or install input hooks. The application passes an optional embedded ICC profile and pixels over stdin; stdout contains RGB pixels.

`src/lab-d50.icc` is a standard D50 Lab profile generated with Little CMS via Pillow's `ImageCms.createProfile('LAB')`. It is used only when the document has no embedded Lab profile. Regenerate it with:

```python
from PIL import ImageCms
open('src/lab-d50.icc', 'wb').write(ImageCms.ImageCmsProfile(ImageCms.createProfile('LAB')).tobytes())
```
