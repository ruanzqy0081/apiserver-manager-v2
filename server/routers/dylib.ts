import { TRPCError } from "@trpc/server";
import { nanoid } from "nanoid";
import { z } from "zod";
import { createDylibBuild, getDylibBuildsByOwner, getDylibBuildsByPackage, getPackageById, logActivity } from "../db";
import { protectedProcedure, router } from "../_core/trpc";
import fs from "fs/promises";
import path from "path";

function generateDylibContent(pkg: { name: string; token: string; version: string }): string {
  return `
// ============================================================
//  API Server Dylib — Robust Initialization Version
//  Package: ${pkg.name}
//  Version: ${pkg.version}
//  Token:   ${pkg.token}
//  Generated: ${new Date().toISOString()}
// ============================================================

#import <Foundation/Foundation.h>
#import <UIKit/UIKit.h>
#import <objc/runtime.h>

static NSString *const kAPIToken = @"${pkg.token}";
static NSString *const kAPIEndpoint = @"https://apiserver-manager-v2-production.up.railway.app/api/trpc";

@interface APIServerSDK : NSObject
+ (instancetype)sharedInstance;
- (void)initialize;
@end

@interface APIServerUI : UIViewController <UITextFieldDelegate>
@property (nonatomic, strong) UIView *containerView;
@property (nonatomic, strong) UILabel *titleLabel;
@property (nonatomic, strong) UILabel *statusLabel;
@property (nonatomic, strong) UITextField *keyField;
@property (nonatomic, strong) UIButton *actionButton;
@property (nonatomic, strong) NSString *currentUDID;
@property (nonatomic, assign) BOOL isRegistering;
@end

@implementation APIServerUI

- (void)viewDidLoad {
    [super viewDidLoad];
    self.view.backgroundColor = [[UIColor blackColor] colorWithAlphaComponent:0.7];
    [self setupUI];
    [self checkStatus];
}

- (void)setupUI {
    CGFloat width = self.view.frame.size.width * 0.85;
    if (width > 350) width = 350;
    
    self.containerView = [[UIView alloc] initWithFrame:CGRectMake(0, 0, width, 320)];
    self.containerView.center = self.view.center;
    self.containerView.backgroundColor = [UIColor colorWithRed:0.10 green:0.10 blue:0.12 alpha:1.0];
    self.containerView.layer.cornerRadius = 20;
    self.containerView.layer.borderWidth = 1.5;
    self.containerView.layer.borderColor = [UIColor colorWithRed:0.25 green:0.25 blue:0.30 alpha:1.0].CGColor;
    [self.view addSubview:self.containerView];
    
    self.titleLabel = [[UILabel alloc] initWithFrame:CGRectMake(10, 25, width-20, 35)];
    self.titleLabel.text = @"${pkg.name} - LOGIN";
    self.titleLabel.textColor = [UIColor whiteColor];
    self.titleLabel.textAlignment = NSTextAlignmentCenter;
    self.titleLabel.font = [UIFont boldSystemFontOfSize:22];
    [self.containerView addSubview:self.titleLabel];
    
    self.statusLabel = [[UILabel alloc] initWithFrame:CGRectMake(15, 70, width-30, 70)];
    self.statusLabel.text = @"Verificando dispositivo...";
    self.statusLabel.textColor = [UIColor colorWithRed:0.7 green:0.7 blue:0.7 alpha:1.0];
    self.statusLabel.textAlignment = NSTextAlignmentCenter;
    self.statusLabel.numberOfLines = 0;
    self.statusLabel.font = [UIFont systemFontOfSize:14];
    [self.containerView addSubview:self.statusLabel];
    
    self.keyField = [[UITextField alloc] initWithFrame:CGRectMake(25, 150, width-50, 50)];
    self.keyField.placeholder = @"DIGITE SUA KEY AQUI";
    self.keyField.backgroundColor = [UIColor colorWithRed:0.15 green:0.15 blue:0.18 alpha:1.0];
    self.keyField.textColor = [UIColor whiteColor];
    self.keyField.layer.cornerRadius = 10;
    self.keyField.textAlignment = NSTextAlignmentCenter;
    self.keyField.hidden = YES;
    self.keyField.delegate = self;
    self.keyField.attributedPlaceholder = [[NSAttributedString alloc] initWithString:self.keyField.placeholder attributes:@{NSForegroundColorAttributeName: [UIColor darkGrayColor]}];
    [self.containerView addSubview:self.keyField];
    
    self.actionButton = [UIButton buttonWithType:UIButtonTypeSystem];
    self.actionButton.frame = CGRectMake(25, 230, width-50, 55)];
    self.actionButton.backgroundColor = [UIColor colorWithRed:0.0 green:0.47 blue:1.0 alpha:1.0];
    [self.actionButton setTitleColor:[UIColor whiteColor] forState:0];
    self.actionButton.titleLabel.font = [UIFont boldSystemFontOfSize:18];
    self.actionButton.layer.cornerRadius = 12;
    [self.actionButton addTarget:self action:@selector(handleAction) forControlEvents:0x40];
    [self.containerView addSubview:self.actionButton];
    
    [self updateButtonState:@"AGUARDE..." enabled:NO];
}

- (void)updateButtonState:(NSString *)title enabled:(BOOL)enabled {
    [self.actionButton setTitle:title forState:0];
    self.actionButton.enabled = enabled;
    self.actionButton.alpha = enabled ? 1.0 : 0.5;
}

- (void)checkStatus {
    self.currentUDID = [[NSUserDefaults standardUserDefaults] stringForKey:@"com.apiserver.udid"];
    if (!self.currentUDID) {
        self.currentUDID = [[[UIDevice currentDevice] identifierForVendor] UUIDString];
        self.statusLabel.text = [NSString stringWithFormat:@"Dispositivo não registrado.\\nUDID: %@", [self.currentUDID substringToIndex:12]];
        [self updateButtonState:@"REGISTRAR DISPOSITIVO" enabled:YES];
        self.isRegistering = YES;
    } else {
        self.statusLabel.text = @"Dispositivo reconhecido.\\nPor favor, insira sua Key.";
        self.keyField.hidden = NO;
        [self updateButtonState:@"ENTRAR" enabled:YES];
        self.isRegistering = NO;
    }
}

- (void)handleAction {
    if (self.isRegistering) {
        [self registerDevice];
    } else {
        [self validateKey];
    }
}

- (void)registerDevice {
    [self updateButtonState:@"REGISTRANDO..." enabled:NO];
    
    NSDictionary *json = @{
        @"json": @{
            @"token": kAPIToken,
            @"udid": self.currentUDID,
            @"name": [NSString stringWithFormat:@"iOS Device %@", [self.currentUDID substringToIndex:4]]
        }
    };
    
    [self callAPI:@"/publicApi.registerDevice" data:json completion:^(NSDictionary *result, NSError *error) {
        dispatch_async(dispatch_get_main_queue(), ^{
            if (error) {
                self.statusLabel.text = @"Erro ao registrar device.";
                [self updateButtonState:@"TENTAR NOVAMENTE" enabled:YES];
            } else {
                [[NSUserDefaults standardUserDefaults] setObject:self.currentUDID forKey:@"com.apiserver.udid"];
                [[NSUserDefaults standardUserDefaults] synchronize];
                self.statusLabel.text = @"Registrado com sucesso!\\nAgora insira sua Key.";
                self.keyField.hidden = NO;
                self.isRegistering = NO;
                [self updateButtonState:@"ENTRAR" enabled:YES];
            }
        });
    }];
}

- (void)validateKey {
    NSString *key = self.keyField.text;
    if (key.length < 4) {
        self.statusLabel.text = @"Por favor, insira uma Key válida.";
        return;
    }
    
    [self updateButtonState:@"VALIDANDO..." enabled:NO];
    
    NSDictionary *json = @{
        @"json": @{
            @"token": kAPIToken,
            @"udid": self.currentUDID,
            @"key": key
        }
    };
    
    [self callAPI:@"/publicApi.validateKey" data:json completion:^(NSDictionary *result, NSError *error) {
        dispatch_async(dispatch_get_main_queue(), ^{
            if (error) {
                self.statusLabel.text = @"Erro na conexão com o servidor.";
                [self updateButtonState:@"ENTRAR" enabled:YES];
                return;
            }
            
            NSDictionary *data = result[@"result"][@"data"][@"json"];
            BOOL valid = [data[@"valid"] boolValue];
            NSString *message = data[@"message"];
            
            if (valid) {
                NSString *expiresAt = data[@"expiresAt"];
                NSString *duration = data[@"duration"];
                
                NSISO8601DateFormatter *formatter = [[NSISO8601DateFormatter alloc] init];
                NSDate *date = [formatter dateFromString:expiresAt];
                NSDateFormatter *displayFormatter = [[NSDateFormatter alloc] init];
                [displayFormatter setDateFormat:@"dd/MM/yyyy HH:mm"];
                NSString *dateStr = [displayFormatter stringFromDate:date];
                
                self.statusLabel.textColor = [UIColor greenColor];
                self.statusLabel.text = [NSString stringWithFormat:@"ACESSO LIBERADO!\\nPlano: %@\\nExpira em: %@", duration, dateStr];
                [self updateButtonState:@"INICIANDO..." enabled:NO];
                
                dispatch_after(dispatch_time(DISPATCH_TIME_NOW, (int64_t)(3 * NSEC_PER_SEC)), dispatch_get_main_queue(), ^{
                    [self dismissViewControllerAnimated:YES completion:nil];
                });
            } else {
                self.statusLabel.textColor = [UIColor redColor];
                self.statusLabel.text = message ?: @"Key inválida ou expirada.";
                [self updateButtonState:@"ENTRAR" enabled:YES];
            }
        });
    }];
}

- (void)callAPI:(NSString *)path data:(NSDictionary *)data completion:(void(^)(NSDictionary *, NSError *))completion {
    NSURL *url = [NSURL URLWithString:[kAPIEndpoint stringByAppendingString:path]];
    NSMutableURLRequest *request = [NSMutableURLRequest requestWithURL:url];
    [request setHTTPMethod:@"POST"];
    [request setValue:@"application/json" forHTTPHeaderField:@"Content-Type"];
    
    NSData *postData = [NSJSONSerialization dataWithJSONObject:data options:0 error:nil];
    [request setHTTPBody:postData];
    
    [[[NSURLSession sharedSession] dataTaskWithRequest:request completionHandler:^(NSData *data, NSURLResponse *response, NSError *error) {
        if (error) {
            completion(nil, error);
            return;
        }
        NSDictionary *result = [NSJSONSerialization JSONObjectWithData:data options:0 error:nil];
        completion(result, nil);
    }] resume];
}

@end

@implementation APIServerSDK

+ (instancetype)sharedInstance {
    static APIServerSDK *instance = nil;
    static dispatch_once_t onceToken;
    dispatch_once(&onceToken, ^{
        instance = [[APIServerSDK alloc] init];
    });
    return instance;
}

- (void)initialize {
    dispatch_async(dispatch_get_main_queue(), ^{
        UIWindow *window = nil;
        if (@available(iOS 13.0, *)) {
            for (UIScene *scene in [UIApplication sharedApplication].connectedScenes) {
                if (scene.activationState == UISceneActivationStateForegroundActive && [scene isKindOfClass:[UIWindowScene class]]) {
                    window = ((UIWindowScene *)scene).windows.firstObject;
                    break;
                }
            }
        }
        if (!window) window = [UIApplication sharedApplication].keyWindow;
        if (!window && [[UIApplication sharedApplication].delegate respondsToSelector:@selector(window)]) {
            window = [UIApplication sharedApplication].delegate.window;
        }
        
        if (!window || !window.rootViewController) {
            NSLog(@"[APIServer] Janela não encontrada, tentando novamente...");
            dispatch_after(dispatch_time(DISPATCH_TIME_NOW, (int64_t)(1 * NSEC_PER_SEC)), dispatch_get_main_queue(), ^{
                [self initialize];
            });
            return;
        }
        
        NSLog(@"[APIServer] Janela encontrada! Apresentando UI...");
        APIServerUI *ui = [[APIServerUI alloc] init];
        ui.modalPresentationStyle = UIModalPresentationOverFullScreen;
        
        UIViewController *topController = window.rootViewController;
        while (topController.presentedViewController) {
            topController = topController.presentedViewController;
        }
        
        [topController presentViewController:ui animated:YES completion:nil];
    });
}

@end

__attribute__((constructor))
static void APIServerInit(void) {
    NSLog(@"[APIServer] Dylib Injetada com Sucesso!");
    [[APIServerSDK sharedInstance] initialize];
}
`;
}

export const dylibRouter = router({
  generate: protectedProcedure
    .input(z.object({
      packageId: z.string(),
    }))
    .mutation(async ({ input, ctx }) => {
      const pkg = await getPackageById(input.packageId);
      if (!pkg) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Pacote não encontrado" });
      }

      const content = generateDylibContent({
        name: pkg.name,
        token: pkg.token,
        version: pkg.version,
      });

      const buildId = nanoid();
      const fileName = \`\${pkg.name}_v\${pkg.version}_\${buildId.substring(0, 6)}.dylib\`;
      const publicDir = path.join(process.cwd(), "public", "builds");
      
      try {
        await fs.mkdir(publicDir, { recursive: true });
        const filePath = path.join(publicDir, fileName);
        await fs.writeFile(filePath, content);

        await createDylibBuild({
          id: buildId,
          packageId: pkg.id,
          ownerId: ctx.user.id,
          fileName,
          status: "completed",
        });

        await logActivity({
          userId: ctx.user.id,
          action: "generate_dylib",
          details: \`Gerou dylib para o pacote \${pkg.name}\`,
        });

        return {
          success: true,
          downloadUrl: \`/builds/\${fileName}\`,
        };
      } catch (error) {
        console.error("Erro ao gerar dylib:", error);
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Erro ao gerar arquivo dylib" });
      }
    }),

  getBuilds: protectedProcedure
    .input(z.object({
      packageId: z.string().optional(),
    }))
    .query(async ({ input, ctx }) => {
      if (input.packageId) {
        return getDylibBuildsByPackage(input.packageId);
      }
      return getDylibBuildsByOwner(ctx.user.id);
    }),
});
