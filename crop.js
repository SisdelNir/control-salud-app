ObjC.import('AppKit');
var pool = $.NSAutoreleasePool.alloc.init;
var fileURL = $.NSURL.fileURLWithPath('/Users/usuario/Desktop/DR-SISDEL/dr_sisdel_logo_option2.png');
var img = $.NSImage.alloc.initWithContentsOfURL(fileURL);
var w = img.size.width;
var h = img.size.height;

// macOS NSImage coordinates are bottom-left!
// So from Y=0 (bottom) to Y=h*0.35 is the bottom 35% of the image.
var cropHeight = h * 0.35;
var cropRect = $.NSMakeRect(0, 0, w, cropHeight);
var destRect = $.NSMakeRect(0, 0, w, cropHeight);

var croppedImg = $.NSImage.alloc.initWithSize(cropRect.size);
croppedImg.lockFocus;
img.drawInRect_fromRect_operation_fraction(
    destRect,
    cropRect,
    $.NSCompositingOperationCopy,
    1.0
);
croppedImg.unlockFocus;

var tiffData = croppedImg.TIFFRepresentation;
var rep = $.NSBitmapImageRep.alloc.initWithData(tiffData);
var pngData = rep.representationUsingType_properties($.NSPNGFileType, $());
var outURL = $.NSURL.fileURLWithPath('/Users/usuario/Desktop/DR-SISDEL/dr_sisdel_logo_text_only.png');
pngData.writeToFile_atomically(outURL.path, false);
pool.drain;
