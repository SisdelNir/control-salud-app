import Cocoa

let imgUrl = URL(fileURLWithPath: "/Users/usuario/Desktop/DR-SISDEL/dr_sisdel_logo_option2.png")
if let img = NSImage(contentsOf: imgUrl),
   let tiff = img.tiffRepresentation,
   let rep = NSBitmapImageRep(data: tiff),
   let cgImage = rep.cgImage {
    
    let width = cgImage.width
    let height = cgImage.height
    
    // Top-left origin. We want to drop the top 60%, keep 35% height.
    let cropRect = CGRect(x: 0, y: Int(Double(height) * 0.60), width: width, height: Int(Double(height) * 0.35))
    
    if let croppedCgImage = cgImage.cropping(to: cropRect) {
        let newRep = NSBitmapImageRep(cgImage: croppedCgImage)
        if let pngData = newRep.representation(using: .png, properties: [:]) {
            let outUrl = URL(fileURLWithPath: "/Users/usuario/Desktop/DR-SISDEL/dr_sisdel_logo_option2_cropped.png")
            try? pngData.write(to: outUrl)
            print("Success")
        }
    }
}
